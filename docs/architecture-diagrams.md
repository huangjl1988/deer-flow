# DeerFlow 架构图

本文件将 DeerFlow 的整体架构整理为一组分层的 Mermaid 图，覆盖：系统拓扑、后端分层、Agent 运行时、工具/沙箱/技能、前端架构、请求数据流、IM 通道与扩展机制。

> 信息来源：[`docs/ARCHITECTURE.md`](ARCHITECTURE.md)、[`backend/AGENTS.md`](../backend/AGENTS.md)、[`backend/docs/ARCHITECTURE.md`](../backend/docs/ARCHITECTURE.md)、[`frontend/AGENTS.md`](../frontend/AGENTS.md)。

---

## 1. 系统拓扑（Service Topology）

Nginx 是唯一对外暴露的入口；Gateway 的 `8001` 端口仅容器内部可达，不对外发布。

```mermaid
flowchart LR
    Client["👤 客户端<br/>浏览器 / LangGraph SDK / IM 平台"]

    subgraph Ingress["Ingress（唯一对外入口）"]
        Nginx["Nginx :2026<br/>统一反向代理"]
    end

    subgraph Services["服务集群"]
        Frontend["Frontend :3000<br/>Next.js 16 · React 19"]
        Gateway["Gateway API :8001<br/>FastAPI + 内嵌 Agent Runtime"]
        Provisioner["Provisioner :8002<br/>（可选，K8s/Provisioner 沙箱模式）"]
    end

    Client -->|HTTP/SSE| Nginx
    Nginx -->|"/* 静态/页面"| Frontend
    Nginx -->|"/api/*  REST"| Gateway
    Nginx -->|"/api/langgraph/* → 重写为 /api/*"| Gateway
    Gateway -.->|沙箱编排| Provisioner

    classDef ingress fill:#e1f5fe,stroke:#0288d1,stroke-width:2px
    classDef svc fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    class Nginx ingress
    class Frontend,Gateway,Provisioner svc
```

**Nginx 路由契约：**

| 路径 | 目标 |
|---|---|
| `/api/langgraph/*` | Gateway LangGraph 兼容运行时（重写为 `/api/*`） |
| `/api/*`（其它） | Gateway REST Routers |
| `/*` | Frontend |

---

## 2. 后端分层：Harness / App 边界

后端严格分为两层，**单向依赖**：`App → Harness`，Harness 永不导入 App（由 `test_harness_boundary.py` 强制）。

```mermaid
flowchart TB
    subgraph AppLayer["App 层（未发布，import: app.*）"]
        GatewayApp["FastAPI Gateway<br/>app/gateway/"]
        Channels["IM 通道集成<br/>app/channels/"]
        Scheduler["调度器<br/>app/scheduler/"]
        SubagentBatches["子 Agent 批处理<br/>app/subagent_batches/"]
    end

    subgraph HarnessLayer["Harness 层（可发布包 deerflow-harness，import: deerflow.*）"]
        Agents["agents/<br/>Lead Agent · 中间件 · 记忆"]
        Sandbox["sandbox/<br/>沙箱执行"]
        Subagents["subagents/<br/>子 Agent 委派"]
        Tools["tools/<br/>内置 + 配置工具"]
        MCP["mcp/<br/>MCP 集成"]
        Skills["skills/<br/>技能发现/加载"]
        Models["models/<br/>模型工厂"]
        Config["config/<br/>配置系统"]
        Extensions["extensions/<br/>插件加载/注册"]
        Community["community/<br/>社区工具（搜索/抓取/AIO）"]
        Client["client.py<br/>DeerFlowClient"]
    end

    subgraph ExtAPILayer["extension-api（可发布，import: deerflow_extension_api.*）"]
        ExtAPI["扩展契约（host-independent）"]
    end

    AppLayer -->|"导入"| HarnessLayer
    HarnessLayer -.->|"依赖契约"| ExtAPILayer
    AppLayer -.->|"实现扩展"| ExtAPILayer

    classDef app fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef harness fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    classDef extapi fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    class GatewayApp,Channels,Scheduler,SubagentBatches app
    class Agents,Sandbox,Subagents,Tools,MCP,Skills,Models,Config,Extensions,Community,Client harness
    class ExtAPI extapi
```

---

## 3. Agent 运行时与中间件链

所有运行模式（`make dev` / Docker / 生产）都通过 Gateway 内的 `RunManager` + `run_agent()` + `StreamBridge` 执行 Agent。`make_lead_agent()` 组装出的 Agent 被一条**中间件链**包裹，在模型调用前依次执行。

```mermaid
flowchart TB
    Start(["RunManager.run_agent()"]) --> MW

    subgraph MW["中间件链（before_model 顺序执行）"]
        MW1["1. ThreadDataMiddleware<br/>初始化 workspace/uploads/outputs 路径"]
        MW2["2. UploadsMiddleware<br/>注入已上传文件列表"]
        MW3["3. SandboxMiddleware<br/>获取沙箱"]
        MW4["4. SummarizationMiddleware<br/>上下文压缩（若启用）"]
        MW5["5. TitleMiddleware<br/>自动生成会话标题"]
        MW6["6. TodoListMiddleware<br/>任务追踪（plan mode）"]
        MW7["7. ViewImageMiddleware<br/>视觉模型图像处理"]
        MW8["8. ClarificationMiddleware<br/>处理 ask_clarification"]
    end

    MW --> AgentCore

    subgraph AgentCore["Agent Core"]
        Model["Model<br/>create_chat_model()"]
        Tools["Tools<br/>get_available_tools()"]
        Prompt["System Prompt<br/>（含技能）"]
    end

    AgentCore -->|SSE 流式输出| StreamBridge["StreamBridge"]
    StreamBridge --> Out(["messages / values / task_* 事件"])

    classDef mw fill:#fff8e1,stroke:#fbc02d,stroke-width:1.5px
    classDef core fill:#e8eaf6,stroke:#3949ab,stroke-width:1.5px
    class MW1,MW2,MW3,MW4,MW5,MW6,MW7,MW8 mw
    class Model,Tools,Prompt core
```

**ThreadState 字段（扩展自 LangGraph `AgentState`）：**

| 字段 | 说明 |
|---|---|
| `messages` | LangChain 消息列表 |
| `sandbox` | 沙箱环境信息 |
| `artifacts` | 生成的文件路径列表 |
| `thread_data` | `{workspace, uploads, outputs}` 路径 |
| `title` | 自动生成的会话标题 |
| `todos` | 任务追踪（plan mode） |
| `viewed_images` | 视觉模型图像数据 |

---

## 4. 工具系统

工具来自三个来源，由 `get_available_tools()` 合并。

```mermaid
flowchart LR
    subgraph Builtin["内置工具<br/>tools/builtins/"]
        B1["present_files"]
        B2["ask_clarification"]
        B3["view_image"]
        B4["review_skill_package"]
    end

    subgraph Configured["配置工具<br/>config.yaml"]
        C1["bash"]
        C2["read_file"]
        C3["write_file"]
        C4["str_replace"]
        C5["ls"]
        C6["web_search / web_fetch"]
    end

    subgraph MCPTools["MCP 工具<br/>extensions_config.json"]
        M1["github"]
        M2["filesystem"]
        M3["postgres"]
        M4["brave-search"]
        M5["puppeteer"]
        Mx["..."]
    end

    Builtin --> Merge["get_available_tools()"]
    Configured --> Merge
    MCPTools --> Merge
    Merge --> Agent["Lead Agent Toolset"]

    classDef src fill:#e0f7fa,stroke:#00838f,stroke-width:1.5px
    class B1,B2,B3,B4,C1,C2,C3,C4,C5,C6,M1,M2,M3,M4,M5,Mx src
```

---

## 5. 沙箱系统

```mermaid
flowchart TB
    Provider["SandboxProvider（抽象）<br/>acquire() / get() / release()"]

    Provider --> Local["LocalSandboxProvider<br/>本地直接执行 · 仅开发"]
    Provider --> Aio["AioSandboxProvider<br/>Docker 容器隔离 · 生产"]

    subgraph Sandbox["Sandbox（抽象接口）"]
        S1["execute_command()"]
        S2["read_file()"]
        S3["write_file()"]
        S4["list_dir()"]
    end

    Local --> Sandbox
    Aio --> Sandbox
    Sandbox --> Agent["Agent 代码执行"]

    classDef provider fill:#fce4ec,stroke:#c2185b,stroke-width:1.5px
    classDef iface fill:#f1f8e9,stroke:#558b2f,stroke-width:1.5px
    class Provider,Local,Aio provider
    class S1,S2,S3,S4 iface
```

**虚拟路径映射：**

| 虚拟路径 | 物理路径 |
|---|---|
| `/mnt/user-data/workspace` | `backend/.deer-flow/threads/{thread_id}/user-data/workspace` |
| `/mnt/user-data/uploads` | `backend/.deer-flow/threads/{thread_id}/user-data/uploads` |
| `/mnt/user-data/outputs` | `backend/.deer-flow/threads/{thread_id}/user-data/outputs` |
| `/mnt/skills` | `deer-flow/skills/` |

---

## 6. 模型工厂

```mermaid
flowchart LR
    Config["config.yaml<br/>models: 列表"] --> Factory["create_chat_model()<br/>models/factory.py"]
    Factory --> Reflection["resolve_class()<br/>reflection 动态加载"]
    Reflection --> Instance["BaseChatModel<br/>LangChain 实例"]
    Instance --> Agent["Lead Agent"]

    subgraph Providers["已支持 Provider"]
        P1["OpenAI<br/>langchain_openai:ChatOpenAI"]
        P2["Anthropic<br/>langchain_anthropic:ChatAnthropic"]
        P3["DeepSeek<br/>langchain_deepseek:ChatDeepSeek"]
        P4["自定义<br/>任意 LangChain 集成"]
    end

    Config -.-> Providers
```

---

## 7. MCP 集成

```mermaid
flowchart TB
    ExtConfig["extensions_config.json<br/>mcpServers: {...}"] --> Manager["MCP Manager<br/>mcp/manager.py"]
    Manager --> Client["MultiServerMCPClient<br/>langchain-mcp-adapters"]

    Client --> T1["stdio transport"]
    Client --> T2["SSE transport"]
    Client --> T3["HTTP transport"]

    Manager --> Cache["MCP 工具缓存<br/>（file mtime 失效）"]
    Cache --> Tools["MCP Tools → Agent Toolset"]

    subgraph LongRunning["长时任务（McpTaskService）"]
        DB["DB（mcp_tasks，租约行）"]
        Driver["McpTaskDriver<br/>协议特定"]
        Loop["后台轮询循环"]
        DB <--> Loop
        Loop <--> Driver
    end

    Manager -.->|"submit/status/cancel"| LongRunning

    classDef lr fill:#fff3e0,stroke:#ef6c00,stroke-width:1.5px
    class DB,Driver,Loop lr
```

> 长时 MCP 任务走独立的持久化任务运行时，远程 task ID 与轮询不进入 Agent 主循环；DB 是唯一事实源。

---

## 8. 技能系统

```mermaid
flowchart TB
    subgraph SkillDirs["技能目录"]
        Public["skills/public/<br/>已提交"]
        Custom["skills/custom/<br/>gitignored"]
        Integrations[".deer-flow/integrations/skills/{provider}/<br/>全局托管集成包"]
    end

    SkillDirs --> Loader["skills/loader.py<br/>发现 + 解析（懒加载）"]
    Loader --> Catalog["Skill Catalog<br/>（内存缓存）"]
    Catalog -->|"按需求加载 / slash 激活"| Agent["Lead Agent System Prompt"]

    subgraph SkillFormat["SKILL.md 格式"]
        F1["---<br/>name / description / license<br/>allowed-tools: [...]<br/>---"]
        F2["# 技能指令正文"]
    end

    Public -.-> SkillFormat

    Reviewer["skills/public/skill-reviewer/<br/>只读质量评审<br/>（review_skill_package 工具）"]
    Reviewer -.->|"评审"| Catalog

    classDef dir fill:#e8f5e9,stroke:#2e7d32,stroke-width:1.5px
    class Public,Custom,Integrations dir
```

---

## 9. 前端架构

```mermaid
flowchart TB
    subgraph NextApp["Next.js 16 App Router (src/app/)"]
        Routes["路由<br/>/workspace/chats/[id]<br/>/workspace/agents/[name]<br/>/showcase/[id]<br/>/(auth)/{login,setup,callback}"]
    end

    subgraph Core["核心业务逻辑 (src/core/)"]
        Threads["threads/<br/>创建·流式·状态"]
        API["api/<br/>LangGraph client 单例"]
        Agents["agents/  auth/  artifacts/"]
        Channels["channels/  integrations/"]
        Memory["memory/  skills/  mcp/  models/"]
        Tasks["tasks/  todos/  tools/"]
        I18n["i18n/ (en-US, zh-CN)"]
    end

    subgraph Components["组件 (src/components/)"]
        Workspace["workspace/<br/>聊天页"]
        Landing["landing/"]
        Docs["docs/"]
        UI["ui/ · ai-elements/<br/>（Shadcn / Vercel AI SDK 生成，勿手改）"]
    end

    subgraph State["状态管理"]
        TanStack["TanStack Query<br/>服务端状态"]
        SSE["SSE 事件归一化<br/>messages / values / task_*"]
    end

    Routes --> Core
    Core --> Components
    API -->|"@langchain/langgraph-sdk"| Backend["Gateway /api/langgraph/*"]
    Threads --> TanStack
    Threads --> SSE
    SSE --> TanStack

    classDef app fill:#e3f2fd,stroke:#1565c0,stroke-width:1.5px
    class Routes app
```

**前端数据流：** `core/threads/` 通过 `core/api/` 订阅 LangGraph run stream → 归一化 SSE 事件 → 写入 TanStack Query 管理的 thread state → 组件渲染。子任务进度走根命名空间 `task_*` 自定义事件。

---

## 10. 请求与运行数据流

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant N as Nginx :2026
    participant G as Gateway :8001
    participant R as RunManager
    participant MW as Middleware Chain
    participant A as Lead Agent
    participant S as Sandbox
    participant T as Tools/MCP

    C->>N: POST /api/langgraph/threads/{id}/runs
    N->>G: 重写为 /api/threads/{id}/runs
    G->>R: run_agent(thread_id, input)
    R->>MW: 加载 ThreadState → 执行中间件链
    MW->>MW: ThreadData → Uploads → Sandbox → Summarization → Title → Todo → ViewImage → Clarification
    MW->>A: 组装 Agent（Model + Tools + Prompt）
    loop Agent 循环
        A->>A: 模型推理
        alt 需要工具
            A->>T: 调用工具
            T->>S: 沙箱内执行
            S-->>T: 结果
            T-->>A: ToolMessage
        end
    end
    A-->>R: messages / values / task_*
    R-->>G: StreamBridge (SSE)
    G-->>N: SSE 流
    N-->>C: 流式响应
```

---

## 11. IM 通道集成

外部 IM 平台通过 Gateway 的同一 Agent 接入。

```mermaid
flowchart LR
    subgraph Platforms["IM 平台"]
        Feishu["飞书"]
        Slack["Slack"]
        Telegram["Telegram"]
        Discord["Discord"]
        DingTalk["钉钉"]
        WeCom["企业微信"]
        WeChat["微信"]
        GitHub["GitHub"]
        Buzz["Buzz (Nostr)"]
    end

    Platforms --> ChannelSvc["Channel Service<br/>app/channels/service.py"]
    ChannelSvc --> Gateway["Gateway<br/>同一 Agent Runtime"]

    classDef im fill:#f3e5f5,stroke:#6a1b9a,stroke-width:1.5px
    class Feishu,Slack,Telegram,Discord,DingTalk,WeCom,WeChat,GitHub,Buzz im
```

---

## 12. 调度器与定时任务

```mermaid
flowchart TB
    Config["config.yaml<br/>scheduler.enabled"] --> Scheduler["Scheduler Service<br/>app/scheduler/"]
    Scheduler -->|"launch_scheduled_thread_run"| Gateway["Gateway Run Lifecycle<br/>（复用同一执行路径）"]
    Gateway --> Agent["Agent 运行"]

    subgraph States["定时任务状态机"]
        Queued["queued<br/>持久化，重启存活"]
        Launching["launching<br/>短租约，唯一可调用 launch"]
        Running["running<br/>关联持久 run"]
    end

    Scheduler -.-> Queued
    Queued -->|claim| Launching
    Launching -->|launch| Running
    Running -->|完成| Done(["terminal"])

    classDef state fill:#fffde7,stroke:#f9a825,stroke-width:1.5px
    class Queued,Launching,Running state
```

> 定时任务**复用** Gateway 的 run 生命周期；调度器只决定"何时"，不引入并行执行栈。非交互运行会移除 `ask_clarification` 工具。

---

## 13. 安全与隔离模型

```mermaid
flowchart TB
    subgraph Isolation["多层隔离"]
        Thread["线程隔离<br/>每会话独立数据目录"]
        SandboxIso["沙箱隔离<br/>Docker AioSandboxProvider（生产）"]
        MCPIso["MCP 隔离<br/>每服务独立进程 + 运行时 env 解析"]
        Ingress["入口隔离<br/>Nginx 唯一对外，Gateway 8001 不发布"]
        Upload["上传隔离<br/>路径遍历校验 + .part 暂存 + 原子替换"]
    end

    Thread --> SandboxIso
    SandboxIso --> MCPIso
    MCPIso --> Ingress
    Ingress --> Upload

    classDef iso fill:#ffebee,stroke:#c62828,stroke-width:1.5px
    class Thread,SandboxIso,MCPIso,Ingress,Upload iso
```

---

## 图例速查

| 颜色 | 含义 |
|---|---|
| 🟦 蓝 | Harness 层 / 前端 |
| 🟧 橙 | App 层 |
| 🟪 紫 | 扩展契约 / IM |
| 🟩 绿 | 前端 / 服务 |
| 🟨 黄 | 中间件 / 状态 |
| 🟥 红 | 安全隔离 |
| 🟦 青 | 工具来源 |
