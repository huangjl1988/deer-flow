# AgentForge 原型需求文档

> 基于原型页面功能梳理，标识每个菜单的使用者角色。
> DeerFlow 集成版 — 结合 LangGraph 超级智能体系统架构。

---

## 角色定义

| 角色 | 说明 | 典型操作 |
|------|------|----------|
| **终端用户** (End User) | 日常使用 AI 对话的业务人员 | 发起对话、查看历史、管理记忆 |
| **智能体开发者** (Agent Developer) | 配置和调优智能体的工程师 | 创建/调试 Agent、编排工作流、编写技能 |
| **平台管理员** (Platform Admin) | 管理平台资源和权限的运维人员 | 管理模型、API Key、团队成员、系统监控 |
| **数据工程师** (Data Engineer) | 管理数据资产和向量存储的工程师 | 管理数据集、向量库、数据导入导出 |
| **质量工程师** (QA Engineer) | 负责评估和测试质量的工程师 | 运行评估、查看 Traces、分析日志 |

---

## 一、Workspace（工作区）

### 1.1 Chats（对话）

| 属性 | 值 |
|------|-----|
| **页面** | `dashboard.html` |
| **使用者** | **终端用户** |
| **优先级** | P0 |

**功能描述：**
deer-flow 的核心交互入口，三栏布局的聊天工作区。

**功能点：**
- 线程列表（左栏）：展示所有对话线程，含名称、预览、时间、消息数徽章
- 聊天窗口（中栏）：消息气泡（用户/助手）、头像、时间戳、模型/token 元数据、打字指示器
- 消息输入框：自动增高 textarea、附件按钮、技能按钮、Enter 发送 / Shift+Enter 换行
- 系统状态（右栏）：Active Agents（Lead Agent、Subagent、Skill Worker、Scheduler）、System Health（Gateway API、PostgreSQL、Model Gateway、Sandbox）
- 统计卡片：Total Threads、Messages Today、Memory Facts、Skills Enabled、MCP Tools、Models
- 线程切换：点击线程项动态加载对应消息历史
- 模拟响应：发送消息后显示打字动画，模拟 SSE 流式回复

**与 deer-flow 对应：**
- 对应 `workspace/layout.tsx` 的左侧线程列表 + 中间消息区 + 右侧设置面板
- SSE 流式回复对应 Gateway `/api/langgraph/*` 的 streaming 响应
- 消息持久化对应 `messages` 表（thread_id, role, content, model, tokens）

---

### 1.2 Agents（智能体）

| 属性 | 值 |
|------|-----|
| **页面** | `agents.html` |
| **使用者** | **智能体开发者** |
| **优先级** | P0 |

**功能描述：**
管理和配置 deer-flow 的自定义智能体（Lead Agent + Subagent）。

**功能点：**
- 统计卡片：Total Agents、Active、Paused、Avg Success Rate
- 筛选标签：All / Production / Staging / Draft
- Agent 卡片网格：每个卡片展示名称、描述、类型标签、状态徽章
- 卡片统计：Runs（运行次数）、Success（成功率）、Avg Time（平均耗时）
- 操作按钮：Configure（配置）、Deploy（部署）、Pause/Resume（暂停/恢复）
- 搜索和排序
- 实时状态指示器（live-dot 动画）

**与 deer-flow 对应：**
- 对应 deer-flow 的 Lead Agent + Subagent 委托机制
- Agent 配置对应 `config.yaml` 中的 model、tools、skills 组合
- 状态对应 LangGraph 的运行生命周期（idle / running / paused）

---

### 1.3 Scheduled Tasks（定时任务）

| 属性 | 值 |
|------|-----|
| **页面** | `scheduled-tasks.html` |
| **使用者** | **智能体开发者** + **平台管理员** |
| **优先级** | P1 |

**功能描述：**
管理 deer-flow 的后台定时任务调度。

**功能点：**
- 统计卡片：Total Tasks、Enabled、Cron Jobs、Runs Today、Failed (24h)
- 筛选标签：All / Enabled / Paused / Running / Failed
- 类型筛选：All Types / Cron / Once
- 任务表格：Status、Task Name、Type（cron/once）、Schedule（cron 表达式）、Context（Fresh Thread/Reuse Thread）、Next Run、Last Run、Actions
- 操作：View Details（查看详情）、Trigger Now（立即触发）
- 展开详情行：Prompt 预览、Last Run 信息（Run ID、时间、错误）、Task Info（Task ID、Schedule、Context、Next Run）
- 操作按钮：New Task、Recipes、Filter、Export

**与 deer-flow 对应：**
- 对应 `scheduler.enabled` 配置和 `/workspace/scheduled-tasks` 页面
- Cron 调度对应 `scheduler.recursion_limit`（默认 1000）
- Context 模式：Fresh Thread（新线程）vs Reuse Thread（复用线程）
- 非交互模式：`context.non_interactive=true` 时排除 `ask_clarification` 工具
- 任务状态：queued → launching → running → completed/failed

---

### 1.4 Runs（运行历史）

| 属性 | 值 |
|------|-----|
| **页面** | `runs.html` |
| **使用者** | **智能体开发者** + **质量工程师** |
| **优先级** | P1 |

**功能描述：**
查看和管理 deer-flow 的 Agent 运行历史。

**功能点：**
- 统计卡片：Total Runs、Success Rate、Avg Duration、Running Now、Failed Today
- 筛选标签：All / Running / Success / Failed / Pending
- 时间范围筛选：Last 1h / 24h / 7d / 30d / Custom
- 运行表格：Status、Run ID、Agent、Type、Duration、Tokens、Cost、Started、Actions
- 展开详情行：Input Preview、Output Preview、Run Stats（Steps、Duration、Tokens、Cost）
- 操作：View Details、Debug Run
- 分页
- 导出 CSV、列设置

**与 deer-flow 对应：**
- 运行记录对应 LangGraph 的 thread checkpointer 持久化数据
- Run ID 对应 thread_id + checkpoint_id
- Tokens/Cost 对应 model 调用的 token 统计

---

## 二、Build（构建）

### 2.1 Workflows（工作流）

| 属性 | 值 |
|------|-----|
| **页面** | `workflows.html` |
| **使用者** | **智能体开发者** |
| **优先级** | P1 |

**功能描述：**
编排 deer-flow 的 LangGraph StateGraph 工作流。

**功能点：**
- 统计卡片：Total Workflows、Active、Draft、Archived
- 筛选标签：All / Active / Draft / Archived
- 工作流卡片：名称、状态标签（Active/Draft/Archived）、描述、节点数、最后修改时间
- 工作流示例：Customer Onboarding Pipeline、Data Processing Pipeline、Content Review & Publish、Invoice Processing Workflow、Legacy Report Generator
- 操作：Edit（编辑）、Run（运行）、Duplicate（复制）、Archive（归档）
- 搜索和排序
- 新建工作流按钮

**与 deer-flow 对应：**
- 对应 LangGraph 的 StateGraph DAG 编排
- 节点对应 Agent 调用、工具调用、条件分支
- 状态对应工作流版本管理（draft → active → archived）

---

### 2.2 Editor（工作流编辑器）

| 属性 | 值 |
|------|-----|
| **页面** | `editor.html` |
| **使用者** | **智能体开发者** |
| **优先级** | P1 |

**功能描述：**
可视化编辑 LangGraph 工作流的 DAG 图。

**功能点：**
- 画布区域：拖拽节点、连线、缩放、平移
- 节点类型：Agent Node、Tool Node、Condition Node、IO Node
- 左侧节点面板：可拖拽的节点模板
- 右侧属性面板：Metadata、Model、Skills、Tools、Performance 配置
- 顶部工具栏：Save、Run All、Validate、Undo/Redo
- 测试运行面板：Run All 按钮、测试结果输出

**与 deer-flow 对应：**
- 对应 LangGraph StateGraph 的可视化编辑
- 节点属性对应 `config.yaml` 中的 agent 配置（model、tools、skills）
- Run All 对应工作流端到端测试运行

---

### 2.3 Debugger（调试器）

| 属性 | 值 |
|------|-----|
| **页面** | `debugger.html` |
| **使用者** | **智能体开发者** + **质量工程师** |
| **优先级** | P2 |

**功能描述：**
交互式调试 Agent 和工具调用。

**功能点：**
- 左侧面板：工具列表和调用树
- 中间面板：调试画布 / 调用链可视化
- 右侧详情面板：选中工具的详细信息
  - Detail sections：Input、Output、Parameters、Execution Trace
- 断点设置、单步执行
- 变量查看和修改
- 实时日志输出

**与 deer-flow 对应：**
- 对应 LangGraph 的 streaming 调试和 interrupt 机制
- 工具调用对应 `ToolNode` 的执行追踪
- Execution Trace 对应 LangGraph 的 checkpoint 回放

---

## 三、Skills & Tools（技能与工具）

### 3.1 Skills（技能）

| 属性 | 值 |
|------|-----|
| **页面** | `skills.html` |
| **使用者** | **智能体开发者** |
| **优先级** | P0 |

**功能描述：**
管理 deer-flow 的技能包（public + custom）。

**功能点：**
- 筛选标签：All / Public / Custom
- 技能卡片网格：图标、名称、描述、作者、分类标签、Uses（使用次数）
- 操作按钮：Enable / Enabled（启停切换）、Create Skill
- 搜索
- 技能分类：Productivity、Testing、Research、Code Review 等

**与 deer-flow 对应：**
- Public 技能对应 `skills/public/`（提交到仓库的公共技能）
- Custom 技能对应 `skills/custom/`（用户自建的本地技能）
- Enable/Disable 对应 `extensions_config.json` 中的技能启停
- Create Skill 对应 `skill-creator` 技能（创建新技能包）
- 质量审核对应 `skill-reviewer` 内置技能（只读审查）

---

### 3.2 Tools（工具）

| 属性 | 值 |
|------|-----|
| **页面** | `tools.html` |
| **使用者** | **智能体开发者** |
| **优先级** | P0 |

**功能描述：**
管理 deer-flow 的工具体系（Built-in + MCP）。

**功能点：**
- 筛选标签：All / Built-in / MCP
- 工具卡片网格：图标、名称、描述、类型标签（Built-in/MCP）、状态
- 操作：Enable/Disable、Configure
- 统计卡片：Total Tools、Built-in、MCP、Enabled
- 搜索

**与 deer-flow 对应：**
- Built-in 工具对应 deer-flow 内置工具集（search、code、file 等）
- MCP 工具对应 `extensions_config.json` 中配置的 MCP 服务器
- 工具启停对应 `extensions_config.json` 的 `enabled` 字段
- MCP 工具调用通过 Gateway 的 MCP 集成层路由

---

### 3.3 Models（模型管理）

| 属性 | 值 |
|------|-----|
| **页面** | `models.html` |
| **使用者** | **平台管理员** |
| **优先级** | P1 |

**功能描述：**
管理 deer-flow 的 LLM 模型提供商和模型配置。

**功能点：**
- 统计卡片：Total Models、Active Providers、Avg Response Time、Token Usage
- 筛选标签：All / OpenAI / Anthropic / Google / Open Source
- 模型表格：Model Name、Provider、Context Window、Latency、Token Usage、Status
- 操作：Configure、Test Connection、Enable/Disable
- 新增模型提供商按钮

**与 deer-flow 对应：**
- 对应 `config.yaml` 中的 `models` 配置段
- Provider 对应 OpenAI、Anthropic、Google、Ollama 等
- 模型选择影响 Lead Agent 和 Subagent 的 LLM 调用
- Token Usage 对应 Gateway 的用量统计

---

## 四、Data（数据）

### 4.1 Datasets（数据集）

| 属性 | 值 |
|------|-----|
| **页面** | `datasets.html` |
| **使用者** | **数据工程师** |
| **优先级** | P2 |

**功能描述：**
管理用于训练、评估和知识库的数据集。

**功能点：**
- 统计卡片：Total Datasets、Total Entries、Storage Used、Active
- 筛选标签：All / Training / Evaluation / Knowledge
- 数据集表格：Name、Type、Entries、Size、Created、Status
- 操作：View、Edit、Export、Delete
- 新建数据集、导入数据

**与 deer-flow 对应：**
- 对应线程上传的文件和数据资产
- Knowledge 数据集对应 RAG 检索的知识源
- Evaluation 数据集对应评估测试集

---

### 4.2 Vector Stores（向量存储）

| 属性 | 值 |
|------|-----|
| **页面** | `vector-stores.html` |
| **使用者** | **数据工程师** |
| **优先级** | P2 |

**功能描述：**
管理向量数据库和嵌入索引。

**功能点：**
- 统计卡片：Total Stores、Total Vectors、Storage Used、Avg Query Latency
- 向量库列表：Name、Provider（Pinecone/Weaviate/ChromaDB）、Dimension、Vector Count、Status
- 操作：Manage Indexes、Query Test、Rebuild、Settings
- 实时查询延迟监控

**与 deer-flow 对应：**
- 对应 deer-flow 的向量检索后端（PostgreSQL pgvector 或外部向量库）
- 向量索引用于记忆检索和 RAG 上下文增强
- Query Latency 对应检索性能监控

---

### 4.3 Memory（记忆）

| 属性 | 值 |
|------|-----|
| **页面** | `memory.html` |
| **使用者** | **终端用户** + **智能体开发者** |
| **优先级** | P0 |

**功能描述：**
管理 deer-flow 的持久化记忆（facts CRUD + 配置）。

**功能点：**
- 统计卡片：Total Facts、Sections、Last Updated、Storage
- 标签页：Facts / Sections / Config
- Facts 列表：每条 fact 包含 ID、Title、Session、Agent、Time、Content、Tags、Importance
- 操作：Add Fact、Edit、Delete、Export、Import
- Sections 管理：Preferences、Project Context、Infrastructure、Development Workflow
- Config：auto-sync 开关、记忆策略配置

**与 deer-flow 对应：**
- 对应 deer-flow 的记忆系统（facts 存储在 PostgreSQL）
- Facts 对应 `memory_facts` 表（id, section, content, tags, importance）
- Sections 对应记忆分区（Preferences、Project Context 等）
- Import/Export 对应记忆的 JSON 导入导出
- auto-sync 对应记忆自动提取和同步

---

## 五、Observability（可观测性）

### 5.1 Traces（链路追踪）

| 属性 | 值 |
|------|-----|
| **页面** | `traces.html` |
| **使用者** | **质量工程师** + **智能体开发者** |
| **优先级** | P1 |

**功能描述：**
分布式追踪 Agent 执行的完整调用链。

**功能点：**
- 统计卡片：Total Traces、Success Rate、Avg Duration、Total Spans
- Trace 列表：Trace ID、Service、Operation、Duration、Spans 数、Status
- Span 详情：时间线瀑布图、Span 树、属性键值对
- 筛选：By Service、By Operation、By Status、Time Range
- 操作：View Waterfall、Compare Traces、Export

**与 deer-flow 对应：**
- 对应 LangGraph 的执行追踪（StateGraph 节点遍历）
- Span 对应每个节点/工具调用的执行段
- 瀑布图对应 Agent 的 step-by-step 执行时间线

---

### 5.2 Evaluations（评估）

| 属性 | 值 |
|------|-----|
| **页面** | `evaluations.html` |
| **使用者** | **质量工程师** |
| **优先级** | P1 |

**功能描述：**
评估 Agent 输出质量和准确性。

**功能点：**
- 统计卡片：Total Evaluations、Pass Rate、Avg Score、Last Run
- 筛选标签：Passed / Failed / Pending
- 评估结果表格：Test Name、Agent、Score、Status、Duration、Timestamp
- 评估维度：Accuracy、Relevance、Safety、Helpfulness
- 操作：Run Evaluation、View Details、Compare Results
- 趋势图表

**与 deer-flow 对应：**
- 对应 deer-flow 的质量评估和测试体系
- 评估数据集对应 Datasets 中的 Evaluation 类型
- Score 对应自动评估和人工评分

---

### 5.3 Logs（日志）

| 属性 | 值 |
|------|-----|
| **页面** | `logs.html` |
| **使用者** | **平台管理员** + **质量工程师** |
| **优先级** | P1 |

**功能描述：**
实时流式日志查看和搜索。

**功能点：**
- 日志级别筛选：All / Error / Warn / Info / Debug（含计数徽章）
- 实时日志流：Timestamp、Level、Service、Message
- 搜索框（全文检索）
- 服务筛选：Gateway、Frontend、Scheduler、Sandbox
- 自动滚动、暂停/恢复
- 导出日志

**与 deer-flow 对应：**
- 对应 Gateway API 的结构化日志输出
- Service 对应 Nginx / Gateway / Frontend / Scheduler / Sandbox
- Level 对应 Python `logging` 模块的日志级别

---

## 六、Settings（设置）

### 6.1 API Keys（API 密钥）

| 属性 | 值 |
|------|-----|
| **页面** | `api-keys.html` |
| **使用者** | **平台管理员** |
| **优先级** | P1 |

**功能描述：**
管理程序化访问 AgentForge 服务的 API 密钥。

**功能点：**
- 统计卡片：Active Keys、API Calls (Today)、Token Usage (Today)
- 密钥列表：Key Name、Description、Permissions、Created、Last Used、Status
- 密钥类型：Production API Key、Staging Key、CI/CD Pipeline、Read-Only Analytics、Webhook Integration
- 操作：Create Key、Revoke、Rotate、Copy
- 权限范围管理

**与 deer-flow 对应：**
- 对应 Gateway API 的认证和授权
- Production/Staging 对应不同部署环境
- CI/CD Key 对应 GitHub Actions 集成
- Read-Only 对应监控和仪表盘只读访问

---

### 6.2 Team（团队）

| 属性 | 值 |
|------|-----|
| **页面** | `team.html` |
| **使用者** | **平台管理员** |
| **优先级** | P1 |

**功能描述：**
管理团队成员、角色和工作区访问权限。

**功能点：**
- 统计卡片：Members、Pending Invites、Active Roles
- 筛选标签：All / Active / Pending
- 成员列表：Name、Email、Role Badge（Admin/Developer/Viewer）、Status、Joined Date
- 操作：Invite Member、Edit Role、Remove、Resend Invite
- 角色权限：Admin（全权管理）、Developer（开发配置）、Viewer（只读查看）

**与 deer-flow 对应：**
- 对应 deer-flow 的用户管理和 RBAC 权限体系
- Admin 角色可管理 `config.yaml` 和 `extensions_config.json`
- Developer 角色可创建/调试 Agent 和工作流
- Viewer 角色仅查看 Dashboard 和 Logs

---

## 七、其他页面

### 7.1 Sandbox（沙箱）

| 属性 | 值 |
|------|-----|
| **页面** | `sandbox.html` |
| **使用者** | **智能体开发者** |
| **优先级** | P2 |

**功能描述：**
隔离的代码执行沙箱环境。

**功能点：**
- 顶栏：沙箱状态（Running）、Sandbox ID（sbx-7f3a2c）、Uptime 计时器
- 四宫格布局：
  - File Explorer（文件浏览器）
  - Terminal（终端，Python 3.11.6 环境）
  - Code Editor（代码编辑器）
  - Output / Preview（输出/预览）
- 文件操作：新建、编辑、删除、上传
- 终端：实时命令执行

**与 deer-flow 对应：**
- 对应 deer-flow 的沙箱化执行环境
- Agent 工具调用在沙箱中执行代码（Python/Shell）
- Sandbox ID 对应隔离的执行环境实例
- 终端对应 Agent 的代码执行工具

---

### 7.2 Preview（预览）

| 属性 | 值 |
|------|-----|
| **页面** | `preview.html` |
| **使用者** | **智能体开发者** |
| **优先级** | P3 |

**功能描述：**
预览工作流或 Agent 的输出结果。

---

## 角色与菜单权限矩阵

| 菜单 | 终端用户 | 智能体开发者 | 平台管理员 | 数据工程师 | 质量工程师 |
|------|:--------:|:------------:|:----------:|:----------:|:----------:|
| **Chats** | ✅ 全权 | ✅ 查看 | ✅ 查看 | — | — |
| **Agents** | — | ✅ 全权 | ✅ 查看 | — | ✅ 查看 |
| **Scheduled Tasks** | — | ✅ 创建/触发 | ✅ 管理 | — | — |
| **Runs** | ✅ 查看自己的 | ✅ 全权 | ✅ 查看 | — | ✅ 查看 |
| **Workflows** | — | ✅ 全权 | ✅ 查看 | — | — |
| **Editor** | — | ✅ 全权 | — | — | — |
| **Debugger** | — | ✅ 全权 | — | — | ✅ 查看 |
| **Skills** | — | ✅ 全权 | ✅ 管理 | — | — |
| **Tools** | — | ✅ 全权 | ✅ 管理 | — | — |
| **Models** | — | ✅ 查看 | ✅ 全权 | — | — |
| **Datasets** | — | — | ✅ 管理 | ✅ 全权 | ✅ 查看 |
| **Vector Stores** | — | — | ✅ 管理 | ✅ 全权 | — |
| **Memory** | ✅ 管理自己的 | ✅ 全权 | ✅ 管理 | — | — |
| **Traces** | — | ✅ 查看自己的 | ✅ 查看 | — | ✅ 全权 |
| **Evaluations** | — | ✅ 查看 | ✅ 查看 | — | ✅ 全权 |
| **Logs** | — | — | ✅ 全权 | — | ✅ 查看 |
| **API Keys** | — | — | ✅ 全权 | — | — |
| **Team** | — | — | ✅ 全权 | — | — |
| **Sandbox** | — | ✅ 全权 | — | — | — |

> ✅ 全权 = 可查看 + 可操作；✅ 查看 = 只读；— = 无权限

---

## 技术约束与对齐

- **后端框架**: Python FastAPI Gateway + LangGraph StateGraph
- **前端框架**: Next.js 16 App Router（Server Components by default）
- **状态管理**: TanStack Query（服务端状态）+ sessionStorage（composer drafts）
- **流式通信**: SSE via Nginx → Gateway `/api/langgraph/*`
- **数据库**: PostgreSQL（threads、messages、checkpoints、memory_facts）
- **配置文件**: `config.yaml`（主配置）+ `extensions_config.json`（MCP + Skills）
- **部署**: Docker Compose（Nginx:2026 / Gateway:8001 / Frontend:3000）
- **扩展系统**: `plugins:` 列表加载第三方 Python 扩展
