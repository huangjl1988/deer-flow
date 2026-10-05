# DeerFlow 技术实现教程 · 总体大纲

> 本教程与「使用教程」并列，面向**想理解 DeerFlow 内部实现、或要二次开发/贡献代码**的工程师。
> 每个模块都基于真实源码（标注文件路径），按「**设计目标 → 核心机制 → 关键代码 → 扩展点**」展开。

---

## 课程定位

| 维度 | 说明 |
|---|---|
| 目标读者 | 后端工程师、AI Agent 框架开发者、想贡献 DeerFlow 的开源贡献者 |
| 前置知识 | Python 3.12+、asyncio、LangGraph 基础概念（StateGraph、Channel、Checkpoint）、Pydantic |
| 与使用教程的区别 | 使用教程讲「怎么用」；本教程讲「怎么实现的、为什么这么设计」 |
| 学习产出 | 能读懂 DeerFlow 核心源码、能定位 bug、能开发扩展、能做架构决策 |

---

## 模块总览

```
运行时基础
├── T1  运行时总览：RunManager / run_agent / StreamBridge 三件套
├── T2  Checkpoint 系统实现（本大纲展开样例）★
└── T3  中间件链机制：8 层中间件如何编排

状态与数据
├── T4  ThreadState 与 Reducer 设计
├── T5  持久化层：SQLite / PostgreSQL / Store 抽象
└── T6  配置系统与热更新边界

核心能力
├── T7  工具系统：三类工具合并与执行
├── T8  沙箱系统：Provider 抽象与隔离
├── T9  MCP 集成：传输协议与长时任务
├── T10 技能系统：懒加载与权限边界
├── T11 记忆系统：提取/队列/检索/压缩
└── T12 子 Agent 委派：双 ID 设计与生命周期

扩展与运维
├── T13 流式输出：SSE 事件与命名空间
├── T14 扩展系统：extension-api 与插件加载
├── T15 安全模型：五层隔离与权限过滤
└── T16 测试策略：TDD 与边界测试
```

---

# T2 · Checkpoint 系统实现（详细教案样例）

> 对应源码目录：`backend/packages/harness/deerflow/runtime/checkpointer/`、`runtime/checkpoint_mode.py`、`runtime/checkpoint_state.py`、`runtime/checkpoint_cache/`、`agents/thread_state.py`、`checkpoint_patches.py`

## 学习目标

1. 理解 DeerFlow 为什么要在 LangGraph Checkpoint 之上再封装一层
2. 掌握 `full` 与 `delta` 两种 checkpoint 模式的差异与适用场景
3. 读懂 checkpointer 后端选择、同步/异步双路径、单例与上下文管理器
4. 理解 delta 模式下的历史缓存（`CachedHistorySaver`）正确性论证
5. 掌握模式安全门禁（fail-closed gate）的设计与迁移语义
6. 能定位 checkpoint 相关的常见 bug

## 2.1 设计目标与背景

**LangGraph 的 Checkpoint 是什么？**
- LangGraph 的图执行是有状态的，状态（State）被持久化到 Checkpoint
- 每个 checkpoint 包含：`channel_values`（各 channel 的值）、`pending_writes`（待写入）、版本号、parent 指针
- Checkpointer 是一个抽象接口（`BaseCheckpointSaver`），实现决定存储后端

**DeerFlow 为什么要封装？**
1. **多后端统一**：memory / sqlite / postgres 三种后端，配置驱动选择
2. **模式安全**：`full` 和 `delta` 两种 channel 模式不能混用，需要 fail-closed
3. **性能优化**：delta 模式下的历史读取需要缓存
4. **状态访问收敛**：所有读写必须过一个门禁，注入模式标记
5. **上游 bug 修复**：LangGraph 某些版本的 InMemorySaver 有 delta 历史 bug

## 2.2 核心概念：full 与 delta 模式

### full 模式（默认）
- 每个 checkpoint 存储**完整**的 `channel_values`
- 读取一次就能拿到完整状态
- 缺点：消息列表会被全量复制，存储和 I/O 开销大

### delta 模式
- 使用 LangGraph 的 `DeltaChannel`：checkpoint 只存**增量写入**（pending_writes）+ 定期快照（snapshot）
- 读取时需要从祖先链**递归组合**（compose）出完整状态
- 优点：写入轻量，适合长对话
- 缺点：读取需要遍历祖先链，需要缓存优化

**DeerFlow 的实现：**
- 模式由 `database.checkpoint_channel_mode` 配置（`"full"` | `"delta"`）
- 模式在进程启动时**冻结**（`freeze_checkpoint_channel_mode`），运行中不可切换
- 冻结值被编译进图的 channel 表，所以必须重启才能改

```python
# runtime/checkpoint_mode.py
_frozen_checkpoint_channel_mode: CheckpointChannelMode | None = None

def freeze_checkpoint_channel_mode(mode):
    global _frozen_checkpoint_channel_mode
    if _frozen_checkpoint_channel_mode is None:
        _frozen_checkpoint_channel_mode = mode
    elif _frozen_checkpoint_channel_mode != mode:
        raise CheckpointModeReconfigurationError(
            "checkpoint_channel_mode is restart-required"
        )
    return _frozen_checkpoint_channel_mode
```

## 2.3 ThreadState 的模式适配

delta 模式下，`messages` 字段要用 `DeltaChannel` 包装：

```python
# agents/thread_state.py
class ThreadState(AgentState):
    messages: list[AnyMessage]          # full 模式：LastValue / 普通列表
    sandbox: SandboxStateField          # 自定义 reducer
    artifacts: Annotated[list[str], merge_artifacts]
    # ... 其他字段

def delta_messages_field(snapshot_frequency=8):
    return Annotated[
        list[AnyMessage],
        DeltaChannel(merge_message_writes, snapshot_frequency=snapshot_frequency),
    ]

class DeltaThreadState(ThreadState):
    messages: DELTA_MESSAGES_FIELD      # delta 模式：DeltaChannel
```

**关键点：**
- `snapshot_frequency`：每 N 步写一次完整快照（默认 8），控制 compose 的递归深度
- `merge_message_writes`：自定义线性时间 reducer，完整复刻 `add_messages` 语义（ID 替换、删除、REMOVE_ALL_MESSAGES）
- 其他 reducer 字段（artifacts、todos、viewed_images 等）在两种模式下共用

## 2.4 Checkpointer 后端与工厂

### 三种后端

| 后端 | 类 | 适用场景 | 持久化 |
|---|---|---|---|
| memory | `InMemorySaver` | 测试、TUI | ❌ 进程内 |
| sqlite | `SqliteSaver` / `AsyncSqliteSaver` | 单机开发/小部署 | ✅ 本地文件 |
| postgres | `PostgresSaver` / `AsyncPostgresSaver` | 生产、多实例 | ✅ 数据库 |

### 配置优先级
1. 遗留 `checkpointer:` 段（向后兼容，优先）
2. 统一 `database:` 段
3. 默认 `InMemorySaver`

### 两条工厂路径

**同步路径**（`runtime/checkpointer/provider.py`）：
- `get_checkpointer()`：全局单例，进程退出时关闭 → TUI/CLI/测试
- `checkpointer_context()`：上下文管理器，用完即关 → 一次性脚本

**异步路径**（`runtime/checkpointer/async_provider.py`）：
- `make_checkpointer()`：异步上下文管理器，在 FastAPI lifespan 中持有 → **Gateway 主路径**

```python
# Gateway 启动时
async with make_checkpointer(app_config) as checkpointer:
    app.state.checkpointer = checkpointer
```

### Postgres 的连接池细节
```python
# async_provider.py::_build_postgres_pool
AsyncConnectionPool(
    dsn,
    kwargs={
        "autocommit": True,
        "prepare_threshold": 0,
        "keepalives": 1,
        "keepalives_idle": 60,
        "keepalives_interval": 10,
        "keepalives_count": 6,
    },
    check=AsyncConnectionPool.check_connection,
)
```
- `search_path` 注入 DSN（而非 kwargs），避免覆盖 DSN 自带的 `statement_timeout`
- TCP keepalive 防止长连接被中间设备断开

## 2.5 Delta 历史缓存：CachedHistorySaver

delta 模式下，`make_checkpointer` 会把原始 saver 包一层 `CachedHistorySaver`。

### 正确性论证（核心设计）
> 一个 checkpoint 的 delta 历史是其**已封印祖先链的纯函数**：
> - LangGraph 契约排除目标自身的 pending writes
> - parent 链接在创建时固定
> - 祖先的写入在其子 checkpoint 存在后即被封印

因此，以 `(thread_id, checkpoint_ns, checkpoint_id, channel)` 为键的缓存条目是**不可变**的，无需失效，跨进程也一致。

### 工作流程
```
aget_delta_channel_history(config, channels)
  ├─ target = aget_tuple(config)         # 拿到目标 checkpoint
  ├─ 查缓存：keys = {(thread, ns, id, ch) for ch in channels}
  ├─ hits = cache.aget_many(keys)
  ├─ 对 miss 的 channel：_aresolve(target, ch, depth=8)
  │    ├─ parent = aget_tuple(target.parent_config)
  │    ├─ 若 parent 有 channel_values[ch] → 直接 compose（命中）
  │    ├─ 否则递归 _aresolve(parent, ch, depth-1)
  │    └─ depth=0 冷链 → 委托一次 inner walk（2 次 SQL）
  └─ 把新计算的条目写回缓存
```

### 关键参数
- `_COMPOSE_MAX_DEPTH = 8`：递归深度预算，超过则走一次完整 walk
- `cache.max_entries`：LRU 容量
- 缓存后端：memory（同步）/ redis（异步）

### 生命周期
- 缓存生命周期 = `make_checkpointer` 上下文管理器生命周期
- `delete_thread` / `prune` 会清除该线程的缓存条目（源删除不能留残留）
- `delete_for_runs` 不清理（run→thread 映射开销大，靠 LRU/TTL 兜底）

## 2.6 模式安全门禁

这是 DeerFlow 在 LangGraph 之上加的最重要的一层保护。

### 问题
- full 模式进程读 delta checkpoint：会得到空/不完整状态（delta 不存完整 channel_values），**静默错误**
- delta 模式进程读 full checkpoint：可以透明读取（full 有完整值）

### 解决方案
1. **写入时打标**：每个 checkpoint 的 metadata 写入 `deerflow_checkpoint_channel_mode: "delta"`
2. **读取时门禁**：
   - full 模式进程读到 delta checkpoint → 抛 `CheckpointModeMismatchError`（fail-closed）
   - delta 模式进程读到 full checkpoint → 透明兼容（支持 full→delta 迁移）

```python
# checkpoint_state.py::CheckpointStateAccessor.get
def get(self, config):
    prepared = self._prepare_config(config)       # 注入模式标记
    snapshot = self.graph.get_state(prepared)
    raise_if_snapshot_incompatible(snapshot, self.mode)  # 门禁
    return snapshot

# checkpoint_mode.py
def raise_if_snapshot_incompatible(snapshot, mode):
    if mode == "full" and state_snapshot_uses_delta(snapshot):
        raise CheckpointModeMismatchError(
            "Thread requires delta mode; materialize and convert its checkpoints before using full mode."
        )
```

### CheckpointStateAccessor：唯一读写入口
- 绑定 `graph + checkpointer + mode`
- 所有读写都过 `_prepare_config` 注入模式标记
- 读：`get/aget/history/ahistory`
- 写：`update/aupdate`（写前调 `ensure_checkpoint_mode_compatible` 预检查）

**为什么需要这个 accessor？** delta checkpoint 不存完整 `channel_values`，直接调 saver 会看到哨兵值，必须经过 accessor 的 compose 逻辑。

## 2.7 状态变更图：State Mutation Graph

用于回滚恢复、上下文压缩等「整体替换状态」的场景：

```python
# checkpoint_state.py
def build_state_mutation_graph(as_node, mode, state_schema=None):
    builder = StateGraph(state_schema or get_thread_state_schema(mode))
    builder.add_node(as_node, _finish_state_mutation)  # 单节点，立即 finish
    builder.set_entry_point(as_node)
    builder.set_finish_point(as_node)
    return builder.compile()
```

- 与 agent 图共享 checkpoint 机制
- 但只调度一个 no-op 节点，写完就 finish，不留 pending 节点
- `update_state(values, as_node=...)` 写入的 head 保持空闲

## 2.8 上游兼容性补丁

`checkpoint_patches.py` 修复了 LangGraph `InMemorySaver.get_delta_channel_history` 的一个 bug：

**Bug**：full→delta 迁移后的第一个 superstep，InMemorySaver 的单次遍历会把终止 checkpoint 自己的 pending writes 当作「被 blob 包含」而跳过，导致迁移后第一条消息丢失。

**修复**：把 `InMemorySaver` 的实现委托回 `BaseCheckpointSaver` 的基类实现（逐个祖先 get_tuple，先收集终止点的 writes 再用 blob 做 seed）。

**防护**：
- 幂等（有 `_PATCH_FLAG`）
- LangGraph 版本检查，超过验证版本（1.2.9）会警告重新审视

## 2.9 关键配置项

```yaml
# config.yaml
database:
  backend: postgres              # memory | sqlite | postgres
  postgres_url: postgresql://...
  postgres_schema: deerflow

  checkpoint_channel_mode: delta  # full | delta（重启生效）
  checkpoint_delta:
    snapshot_frequency: 8          # 每 N 步一次完整快照
  checkpoint_cache:
    type: redis                     # memory | redis
    max_entries: 10000
    redis_url: redis://...
```

## 2.10 扩展点与常见问题

| 场景 | 做法 |
|---|---|
| 新增 checkpoint 后端 | 实现 `BaseCheckpointSaver`，在 `provider.py` 的 `_sync_checkpointer_cm` / `async_provider.py` 的 `_async_checkpointer` 加分支 |
| 切换 full↔delta | 必须重启；full→delta 支持透明迁移，delta→full 需要先物化转换 |
| 跨进程共享 checkpoint | 用 postgres 后端 + 相同 `postgres_schema` |
| delta 读取慢 | 增大 `snapshot_frequency`（减少快照但增加 compose 深度）或配置 redis 缓存 |
| checkpoint 膨胀 | 调用 `prune(thread_ids, strategy="keep_latest")` |

## 实践作业
1. 用 sqlite 后端跑一次对话，用 DB 工具查看 `checkpoints` 表的 `channel_values` 和 `pending_writes`
2. 切换到 delta 模式，对比同一条对话的 checkpoint 存储差异
3. 写一个测试：full 模式进程读 delta checkpoint，验证抛出 `CheckpointModeMismatchError`
4. 阅读 `CachedHistorySaver._aresolve`，画出 50 步对话中缓存命中的传播过程

---

# 其他模块内容预告

## T1 · 运行时总览
- `RunManager`：run 生命周期管理、并发控制、恢复
- `run_agent()`：组装 agent + 执行图 + SSE 桥接
- `StreamBridge`：LangGraph stream → Gateway SSE 的转换层
- 三种启动模式如何复用同一条路径

## T3 · 中间件链机制
- `AgentMiddleware` 接口（before_model / after_model / around_model_call）
- 8 层中间件的顺序与职责
- 中间件如何修改 state、注入工具、拦截模型调用
- 自定义中间件开发

## T4 · ThreadState 与 Reducer 设计
- 为什么需要自定义 reducer（而非 LastValue）
- 各个 reducer 的语义（merge_artifacts、merge_delegations、merge_skill_context...）
- delta 模式下 `merge_message_writes` 的线性时间算法
- middleware 如何贡献 state schema

## T5 · 工具系统
- `get_available_tools()`：内置 + 配置 + MCP 三类合并
- 工具的 schema 生成与鉴权过滤
- 工具执行的沙箱边界
- deferred tool 与 auto-promote 机制

## T6 · 沙箱系统
- `SandboxProvider` 抽象（acquire/get/release）
- LocalSandbox vs AioSandbox 的实现差异
- 虚拟路径映射（/mnt/user-data/*）
- 路径遍历防护

## T7 · MCP 集成
- MultiServerMCPClient 与传输协议
- MCP 工具缓存与 mtime 失效
- McpTaskService 长时任务：租约、轮询、死信
- 进程隔离与 env 解析

## T8 · 技能系统
- SKILL.md 解析与 allowed-tools 权限
- 懒加载发现与 slash 激活
- skill-reviewer 质量评审
- deferred_discovery 紧凑索引模式

## T9 · 记忆系统
- 提取 → 队列 → 检索 → 合并流水线
- 多后端：Markdown / SQLite / PG / Mem0 / Honcho
- 上下文压缩（SummarizationMiddleware）
- 提示注入防护

## T10 · 子 Agent 委派
- `tool_call_id`（关联键）vs `execution_id`（服务端所有权）双 ID 设计
- SubagentExecutor 后台执行、轮询、取消、超时
- SSE 命名空间（`values|<ns>`）
- token 用量归集

## T11 · SSE 流式输出
- stream_mode：messages / values / custom
- StreamBridge 的事件归一化
- 子图命名空间与根事件的区分
- write_file/str_replace 的批量 delta 流式

## T12 · 持久化层
- Store 抽象（LangGraph Store）
- SQLite / PostgreSQL schema 与迁移（Alembic）
- 多 worker 并发：run_ownership + 心跳
- 检查点与 run events 的分离

## T13 · 扩展系统
- `deerflow-extension-api` 契约
- 五种贡献类型：middleware / task lifecycle / observer / service / router
- 加载顺序与放置保证
- 隔离机制与安全边界

## T14 · 安全模型
- 五层隔离：线程 / 沙箱 / MCP / 入口 / 上传
- 认证授权：OIDC / 内部认证 / 工具级权限
- 配置文件的读写边界（config.yaml :ro）
- loopback-by-default 入口策略

## T15 · 测试策略
- TDD 强制要求
- 边界测试：harness/app 分离、并发、重启恢复
- 回放测试（replay）与 golden 测试
- 阻塞 IO 检测（blocking_io 测试套件）

---

## 附录：源码导航

| 主题 | 关键文件 |
|---|---|
| Checkpoint 工厂（同步） | `runtime/checkpointer/provider.py` |
| Checkpoint 工厂（异步） | `runtime/checkpointer/async_provider.py` |
| 模式安全 | `runtime/checkpoint_mode.py` |
| 状态访问器 | `runtime/checkpoint_state.py` |
| Delta 缓存 | `runtime/checkpointer/cached_saver.py`、`runtime/checkpoint_cache/` |
| ThreadState | `agents/thread_state.py` |
| 上游补丁 | `checkpoint_patches.py` |
| 配置 | `config/checkpointer_config.py`、`config/database_config.py` |
| Agent 组装 | `agents/factory.py`、`agents/lead_agent/agent.py` |
