# AgentForge 分阶段实施路线图

> 基于《AgentForge 原型需求文档》，按功能依赖关系和用户价值排序，分 5 期交付。

---

## 总览

| 阶段 | 名称 | 页面数 | 核心目标 | 覆盖角色 |
|:----:|------|:------:|----------|----------|
| Phase 1 | 核心对话闭环 | 5 | 用户能与 Agent 对话、Agent 有记忆和技能 | 终端用户、智能体开发者 |
| Phase 2 | 运营与编排 | 6 | 管理模型、工作流、定时任务、团队权限 | 平台管理员、智能体开发者 |
| Phase 3 | 可观测性 | 3 | 追踪、评估、日志监控 | 质量工程师、平台管理员 |
| Phase 4 | 高级构建工具 | 2 | 可视化工作流编辑器和调试器 | 智能体开发者 |
| Phase 5 | 数据与扩展 | 4 | 数据集、向量库、沙箱、预览 | 数据工程师、智能体开发者 |

---

## Phase 1 — 核心对话闭环

> **目标**：用户能发起对话，Agent 能调用技能和工具回复，并记住上下文。
> **交付标准**：从打开页面到完成一轮带工具调用的对话，全链路可用。

### 1.1 Chats（对话）  · P0

| 项 | 内容 |
|----|------|
| 使用者 | 终端用户 |
| 设计重点 | 三栏布局：线程列表 / 消息流（气泡+打字动画+SSE流式）/ 系统状态侧栏 |
| 核心交互 | 新建线程、切换线程、发送消息、Enter 发送 / Shift+Enter 换行、附件上传 |
| 依赖 | Agents（回复者）、Memory（上下文）、Skills/Tools（能力扩展） |

**设计要点：**
- 线程列表项：名称 + 最后消息预览 + 时间 + 消息数徽章
- 消息气泡：用户（右，青色）/ 助手（左，深色），含头像、时间戳、模型/token 元数据
- 输入框：自动增高 textarea + 附件按钮 + 技能选择 + 发送按钮
- 打字指示器：三点动画，模拟 SSE 流式回复
- 右栏：Active Agents 状态 + System Health 指标

### 1.2 Agents（智能体）  · P0

| 项 | 内容 |
|----|------|
| 使用者 | 智能体开发者 |
| 设计重点 | Agent 卡片网格：名称、描述、状态徽章、运行统计 |
| 核心交互 | 创建 Agent、配置 model/tools/skills 组合、启停、部署到 Production/Staging |
| 依赖 | Models（Phase 2）、Skills、Tools |

**设计要点：**
- 卡片布局：图标 + 名称 + 描述 + 类型标签 + 状态徽章（Active/Paused/Draft）
- 卡片统计行：Runs、Success Rate、Avg Time
- 操作按钮：Configure / Deploy / Pause
- 筛选标签：All / Production / Staging / Draft

### 1.3 Skills（技能）  · P0

| 项 | 内容 |
|----|------|
| 使用者 | 智能体开发者 |
| 设计重点 | 技能卡片网格，区分 Public / Custom 两类来源 |
| 核心交互 | Enable/Disable 启停、Create Skill 创建新技能 |
| 依赖 | 无（独立功能模块） |

**设计要点：**
- 筛选标签：All / Public / Custom
- 卡片信息：图标 + 名称 + 描述 + 作者 + 分类 + Uses 次数
- 启停按钮：Enable → Enabled 状态切换
- Create Skill 入口

### 1.4 Tools（工具）  · P0

| 项 | 内容 |
|----|------|
| 使用者 | 智能体开发者 |
| 设计重点 | 工具卡片网格，区分 Built-in / MCP 两类来源 |
| 核心交互 | Enable/Disable、Configure（MCP 服务器配置） |
| 依赖 | 无（独立功能模块） |

**设计要点：**
- 筛选标签：All / Built-in / MCP
- 卡片信息：图标 + 名称 + 描述 + 类型标签 + 状态
- 统计卡片：Total Tools / Built-in / MCP / Enabled

### 1.5 Memory（记忆）  · P0

| 项 | 内容 |
|----|------|
| 使用者 | 终端用户 + 智能体开发者 |
| 设计重点 | Facts 列表 CRUD + Sections 分区管理 + Import/Export |
| 核心交互 | 增删改 Fact、按 Section 浏览、导入导出 JSON |
| 依赖 | Chats（对话上下文产生记忆） |

**设计要点：**
- 标签页：Facts / Sections / Config
- Facts 列表项：Title + Content + Tags + Importance + Session + Time
- 操作按钮：Add Fact / Edit / Delete / Export / Import
- Sections：Preferences / Project Context / Infrastructure / Development Workflow
- Config：auto-sync 开关

---

### Phase 1 依赖关系

```
Agents ─┐
        ├─→ Chats（核心对话）
Skills ─┤
        │
Tools ──┘

Memory ←── Chats（对话产生记忆）
```

> **设计顺序建议**：Chats → Agents → Skills + Tools（并行）→ Memory
> Chats 是整个系统的入口和核心交互，先定三栏布局和消息流，再设计 Agent 配置，
> Skills 和 Tools 可并行设计（卡片网格结构相似），Memory 最后补充。

---

## Phase 2 — 运营与编排

> **目标**：管理员能管理模型提供商，开发者能编排工作流和定时任务，团队能协作。
> **交付标准**：完整的工作流从编排 → 调度 → 运行 → 回顾全链路。

### 2.1 Models（模型管理）  · P1

| 项 | 内容 |
|----|------|
| 使用者 | 平台管理员 |
| 设计重点 | 模型提供商表格 + 连接测试 + 用量统计 |
| 依赖 | Agents（Phase 1 的 Agent 选择模型） |

**设计要点：**
- 筛选标签：All / OpenAI / Anthropic / Google / Open Source
- 表格列：Model Name / Provider / Context Window / Latency / Token Usage / Status
- 操作：Configure / Test Connection / Enable-Disable

### 2.2 Workflows（工作流）  · P1

| 项 | 内容 |
|----|------|
| 使用者 | 智能体开发者 |
| 设计重点 | 工作流卡片列表 + 状态管理 + 节点预览 |
| 依赖 | Agents + Skills + Tools（Phase 1） |

**设计要点：**
- 筛选标签：All / Active / Draft / Archived
- 卡片信息：名称 + 状态标签 + 描述 + 节点数 + 最后修改
- 操作：Edit / Run / Duplicate / Archive

### 2.3 Runs（运行历史）  · P1

| 项 | 内容 |
|----|------|
| 使用者 | 智能体开发者 + 质量工程师 |
| 设计重点 | 运行表格 + 展开详情 + 状态筛选 + 时间范围 |
| 依赖 | Agents + Workflows（运行来源） |

**设计要点：**
- 统计卡片：Total Runs / Success Rate / Avg Duration / Running Now / Failed Today
- 表格列：Status / Run ID / Agent / Type / Duration / Tokens / Cost / Started
- 展开行：Input Preview / Output Preview / Run Stats

### 2.4 Scheduled Tasks（定时任务）  · P1

| 项 | 内容 |
|----|------|
| 使用者 | 智能体开发者 + 平台管理员 |
| 设计重点 | Cron 调度 + 上下文模式（Fresh/Reuse）+ 状态流转 |
| 依赖 | Runs + Agents（任务执行者） |

**设计要点：**
- 筛选标签：All / Enabled / Paused / Running / Failed
- 表格列：Status / Task Name / Type / Schedule / Context / Next Run / Last Run
- 展开行：Prompt / Last Run 详情 / Task Info
- 操作：Trigger Now / View Details

### 2.5 API Keys  · P1

| 项 | 内容 |
|----|------|
| 使用者 | 平台管理员 |
| 设计重点 | 密钥列表 + 权限范围 + 轮转管理 |
| 依赖 | 无 |

**设计要点：**
- 统计卡片：Active Keys / API Calls / Token Usage
- 密钥列表：Name / Description / Permissions / Last Used / Status
- 操作：Create / Revoke / Rotate / Copy

### 2.6 Team（团队）  · P1

| 项 | 内容 |
|----|------|
| 使用者 | 平台管理员 |
| 设计重点 | 成员列表 + 角色徽章 + 邀请流程 |
| 依赖 | API Keys（权限体系联动） |

**设计要点：**
- 筛选标签：All / Active / Pending
- 成员列表：Name / Email / Role Badge（Admin/Developer/Viewer）/ Status
- 操作：Invite / Edit Role / Remove

---

### Phase 2 依赖关系

```
Models ──────────────────────→ Agents（回填配置）

Workflows ──→ Runs ──→ Scheduled Tasks
               │
               └──→ Traces / Evaluations（Phase 3）

API Keys ──→ Team（权限体系）
```

> **设计顺序建议**：Models → Workflows → Runs → Scheduled Tasks → API Keys + Team（并行）
> Models 先行因为 Agent 配置依赖模型选择；Workflows 产出 Runs；Scheduled Tasks 依赖 Runs 的生命周期。

---

## Phase 3 — 可观测性

> **目标**：质量工程师和运维能追踪执行链路、评估质量、查看日志。
> **交付标准**：任何一次运行可从 Traces → Logs → Evaluations 全链路追溯。

### 3.1 Traces（链路追踪）  · P1

| 项 | 内容 |
|----|------|
| 使用者 | 质量工程师 + 智能体开发者 |
| 设计重点 | Span 瀑布图 + 调用树 + 属性详情 |
| 依赖 | Runs（Phase 2，运行产生 Trace） |

**设计要点：**
- 统计卡片：Total Traces / Success Rate / Avg Duration / Total Spans
- Trace 列表 + Span 瀑布图
- 筛选：By Service / By Operation / By Status

### 3.2 Evaluations（评估）  · P1

| 项 | 内容 |
|----|------|
| 使用者 | 质量工程师 |
| 设计重点 | 评估结果表格 + 评分维度 + 趋势图 |
| 依赖 | Runs + Datasets（Phase 5，评估数据集） |

**设计要点：**
- 统计卡片：Total Evaluations / Pass Rate / Avg Score / Last Run
- 筛选标签：Passed / Failed / Pending
- 评估维度：Accuracy / Relevance / Safety / Helpfulness

### 3.3 Logs（日志）  · P1

| 项 | 内容 |
|----|------|
| 使用者 | 平台管理员 + 质量工程师 |
| 设计重点 | 实时流式日志 + 级别筛选 + 全文搜索 |
| 依赖 | 无（独立监控模块） |

**设计要点：**
- 日志级别筛选：All / Error / Warn / Info / Debug（含计数）
- 实时日志流：Timestamp / Level / Service / Message
- 服务筛选：Gateway / Frontend / Scheduler / Sandbox

---

> **设计顺序建议**：Logs（最独立）→ Traces → Evaluations
> Logs 可独立设计；Traces 依赖 Runs 数据；Evaluations 依赖 Runs + Datasets。

---

## Phase 4 — 高级构建工具

> **目标**：开发者能可视化编排工作流 DAG 图，交互式调试 Agent。
> **交付标准**：从 Editor 画布拖拽建图 → Run All 测试 → Debugger 单步调试。

### 4.1 Editor（工作流编辑器）  · P1

| 项 | 内容 |
|----|------|
| 使用者 | 智能体开发者 |
| 设计重点 | 画布拖拽 + 节点面板 + 属性配置面板 + 测试运行 |
| 依赖 | Workflows（Phase 2，编辑器操作工作流） |

**设计要点：**
- 画布：拖拽节点 / 连线 / 缩放 / 平移
- 左侧节点面板：Agent Node / Tool Node / Condition Node / IO Node
- 右侧属性面板：Metadata / Model / Skills / Tools / Performance
- 顶部工具栏：Save / Run All / Validate / Undo-Redo

### 4.2 Debugger（调试器）  · P2

| 项 | 内容 |
|----|------|
| 使用者 | 智能体开发者 + 质量工程师 |
| 设计重点 | 工具调用树 + 断点单步 + 变量查看 + 实时日志 |
| 依赖 | Agents + Workflows（被调试对象） |

**设计要点：**
- 左侧：工具列表 + 调用树
- 中间：调试画布 / 调用链可视化
- 右侧详情：Input / Output / Parameters / Execution Trace
- 断点 / 单步执行 / 变量查看

---

> **设计顺序建议**：Editor → Debugger
> Editor 先行因为 Debugger 调试的是 Editor 编排的工作流。

---

## Phase 5 — 数据与扩展

> **目标**：管理数据资产、向量存储，提供代码沙箱。
> **交付标准**：数据全生命周期管理 + 隔离代码执行环境。

### 5.1 Datasets（数据集）  · P2

| 项 | 内容 |
|----|------|
| 使用者 | 数据工程师 |
| 设计重点 | 数据集表格 + 类型分类 + 导入导出 |
| 依赖 | Evaluations（Phase 3，评估数据集） |

**设计要点：**
- 筛选标签：All / Training / Evaluation / Knowledge
- 表格列：Name / Type / Entries / Size / Created / Status

### 5.2 Vector Stores（向量存储）  · P2

| 项 | 内容 |
|----|------|
| 使用者 | 数据工程师 |
| 设计重点 | 向量库列表 + 查询延迟监控 + 索引管理 |
| 依赖 | Memory（Phase 1，记忆检索使用向量库） |

**设计要点：**
- 统计卡片：Total Stores / Total Vectors / Storage Used / Avg Query Latency
- 列表：Name / Provider / Dimension / Vector Count / Status
- 操作：Manage Indexes / Query Test / Rebuild

### 5.3 Sandbox（沙箱）  · P2

| 项 | 内容 |
|----|------|
| 使用者 | 智能体开发者 |
| 设计重点 | 四宫格布局：文件浏览器 / 终端 / 编辑器 / 输出 |
| 依赖 | Agents（Agent 工具调用在沙箱执行） |

**设计要点：**
- 顶栏：状态 + Sandbox ID + Uptime
- 四宫格：File Explorer / Terminal / Code Editor / Output
- Python 3.11.6 环境

### 5.4 Preview（预览）  · P3

| 项 | 内容 |
|----|------|
| 使用者 | 智能体开发者 |
| 设计重点 | 工作流/Agent 输出结果预览 |
| 依赖 | Editor + Workflows |

---

> **设计顺序建议**：Vector Stores + Datasets（并行）→ Sandbox → Preview

---

## 各阶段交付物与验收标准

| 阶段 | 交付页面 | 验收标准 | 可用角色 |
|:----:|:-------:|----------|----------|
| **Phase 1** | Chats, Agents, Skills, Tools, Memory | 用户能发起对话，Agent 调用技能和工具回复，记忆上下文 | 终端用户、智能体开发者 |
| **Phase 2** | Models, Workflows, Runs, Scheduled Tasks, API Keys, Team | 完整编排→调度→运行→回顾链路，团队协作和权限管理 | + 平台管理员 |
| **Phase 3** | Traces, Evaluations, Logs | 任何运行可全链路追溯，质量可评估 | + 质量工程师 |
| **Phase 4** | Editor, Debugger | 可视化编排 DAG 图，交互式断点调试 | 智能体开发者 |
| **Phase 5** | Datasets, Vector Stores, Sandbox, Preview | 数据全生命周期管理 + 隔离代码执行 | + 数据工程师 |

---

## 设计启动建议

### Phase 1 设计顺序

```
Step 1: Chats（三栏布局 + 消息流 + 输入框）
        ↓ 确定整体布局框架和视觉语言
Step 2: Agents（卡片网格 + 配置面板）
        ↓ 确定 Agent 的 model/tools/skills 配置形态
Step 3: Skills + Tools（并行，卡片网格结构相似）
        ↓ 确定技能和工具的启停交互
Step 4: Memory（Facts 列表 + Sections + Import/Export）
        补充对话上下文管理
```

### 每个页面设计交付物

- [ ] 页面线框图（标注交互元素和数据流）
- [ ] 组件拆解（原子组件 → 复合组件 → 页面模板）
- [ ] 状态定义（空状态 / 加载态 / 正常态 / 错误态）
- [ ] 响应式断点（< 1400px / < 900px）
- [ ] 与 deer-flow 后端 API 的对接方案
