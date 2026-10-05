# DeerFlow 教程课程 · 总体目录大纲

> DeerFlow = Deep Exploration & Efficient Research Flow，基于 LangGraph 的开源超级 Agent 系统。
> 本课程按「**入门 → 进阶 → 高级 → 专家**」四阶段设计，覆盖三类角色：**终端用户 / 配置管理员 / 扩展开发者**。

---

## 课程定位与学习路径

| 阶段 | 目标角色 | 核心收获 | 预计课时 |
|---|---|---|---|
| 入门篇 | 终端用户 | 能跑起来、会用聊天 | 2 课时 |
| 进阶篇 | 高级用户 / 配置管理员 | 会配置模型/工具/MCP/技能/沙箱 | 4 课时 |
| 高级篇 | 开发者 | 理解架构，能写技能、接 MCP、开发扩展 | 5 课时 |
| 专家篇 | 运维 / 贡献者 | 生产部署、IM 通道接入、贡献代码 | 3 课时 |

**前置要求**：Python 3.12+ 基础、命令行操作、基本的 AI/LLM 概念（prompt、token、function calling）。Docker 基础在部署模块需要。

---

## 模块总览

```
入门篇
├── M0  课程导论：DeerFlow 是什么、能做什么
└── M1  快速上手：环境搭建与第一次对话

进阶篇
├── M2  核心概念：Thread / Agent / Run / Tool / Skill / Sandbox / Memory
├── M3  架构总览：四层架构与请求流转
├── M4  日常使用：聊天、上传、产物、计划模式、目标管理
├── M5  配置系统：config.yaml 与 extensions_config.json
└── M6  模型与工具：模型工厂 + 内置/配置工具

高级篇
├── M7  技能系统：SKILL.md 规范与技能开发
├── M8  MCP 集成：接入外部工具与服务
├── M9  沙箱系统：本地与 Docker 隔离执行
├── M10 记忆系统：持久记忆与上下文压缩
└── M11 子 Agent 委派与定时任务

专家篇
├── M12 IM 通道接入：飞书 / Slack / Telegram 等
├── M13 扩展开发：Python 插件与 extension-api
└── M14 部署运维与安全：Docker / 生产 / 隔离模型
```

---

## 入门篇

### M0 · 课程导论：DeerFlow 是什么

**学习目标**：建立全局认知，明确学习路径。

- 0.1 DeerFlow 的定位：LangGraph 超级 Agent，与普通 ChatBot 的区别
- 0.2 核心能力速览：沙箱执行、持久记忆、子 Agent 委派、可扩展工具/技能、多 IM 接入
- 0.3 适用场景：深度研究、代码生成、自动化任务、多平台助手
- 0.4 课程地图与学习建议（按角色选学）
- 0.5 配套资源：官方文档、架构图、社区

**实践**：浏览 DeerFlow 架构图，说出自己最感兴趣的 1 个能力。

---

### M1 · 快速上手：环境搭建与第一次对话

**学习目标**：从零跑通 DeerFlow，完成第一次 AI 对话。

- 1.1 环境准备：Python 3.12+、Node 22+、pnpm、（可选）Docker
- 1.2 三步启动：`make config` → `make install` → `make dev`
- 1.3 打开浏览器访问 `http://localhost:2026`
- 1.4 配置第一个模型（config.yaml 中的 models）
- 1.5 发起第一次对话，观察流式响应
- 1.6 常见启动问题排查

**实践**：启动本地 DeerFlow，与 Agent 完成一次"帮我总结当前目录"的对话。

---

## 进阶篇

### M2 · 核心概念体系

**学习目标**：掌握 DeerFlow 的核心抽象，为后续模块打基础。

- 2.1 **Thread（线程）**：一次会话 = 一个 Thread，隔离的数据目录
- 2.2 **Agent（智能体）**：Lead Agent 的组成（模型 + 工具 + 系统提示词）
- 2.3 **Run（运行）**：一次消息处理的生命周期，SSE 流式
- 2.4 **Tool（工具）**：内置 / 配置 / MCP 三类来源
- 2.5 **Skill（技能）**：可加载的指令包，按需激活
- 2.6 **Sandbox（沙箱）**：代码执行的隔离边界
- 2.7 **Memory（记忆）**：跨会话的持久化知识
- 2.8 **Sub-agent（子 Agent）**：后台委派执行
- 2.9 概念关系图：这些概念如何协作

**实践**：对照架构图，画出 Thread → Run → Agent → Tool 的调用链。

---

### M3 · 架构总览：四层架构与请求流转

**学习目标**：理解 DeerFlow 的整体架构，建立心智模型。

- 3.1 四层架构：接入层 → 前端应用层 → 网关运行时层 → 核心能力支撑层
- 3.2 服务拓扑：Nginx(2026) / Gateway(8001) / Frontend(3000) / Provisioner(8002)
- 3.3 Nginx 路由契约：`/api/langgraph/*` 重写、`/api/*` 转发、`/*` 静态
- 3.4 后端 Harness/App 分离：为什么 `deerflow` 不导入 `app`
- 3.5 一次请求的完整旅程（时序图）：浏览器 → Nginx → Gateway → 中间件链 → Agent → SSE
- 3.6 关键代码位置速查

**实践**：打开浏览器 DevTools，跟踪一次对话的 SSE 事件流。

---

### M4 · 日常使用：聊天工作台全功能

**学习目标**：熟练使用 Web UI 的所有交互功能。

- 4.1 聊天会话：新建、切换、删除 Thread
- 4.2 流式响应：token 流、工具调用过程展示
- 4.3 文件上传：支持的格式、虚拟路径映射、Markdown 转换
- 4.4 产物（Artifacts）：Agent 生成的文件如何查看与下载
- 4.5 计划模式（Plan Mode）：Todo 任务追踪，`write_todos`
- 4.6 目标管理：`/goal` 设置完成条件
- 4.7 视觉支持：上传图片与 `view_image`
- 4.8 公开演示（Showcase）：只读分享会话

**实践**：用计划模式让 Agent 拆解并完成一个多步骤任务，截图 Todo 进度。

---

### M5 · 配置系统

**学习目标**：掌握两大配置文件的结构与热更新机制。

- 5.1 `config.yaml`：主配置（只读，`:ro`）
  - models：模型列表与 Provider 配置
  - tools：启用的工具
  - sandbox：沙箱模式选择
  - summarization：上下文压缩
  - scheduler：定时任务
  - plugins：第三方扩展（⚠️ 会导入代码）
- 5.2 `extensions_config.json`：MCP 服务 + 技能状态（运行时可写）
- 5.3 配置热更新：运行时修改后如何生效
- 5.4 环境变量与密钥管理：`$API_KEY` 解析
- 5.5 配置校验与 doctor 诊断：`make doctor`

**实践**：在 config.yaml 中新增一个模型并在 UI 中切换使用。

---

### M6 · 模型与工具

**学习目标**：理解模型工厂机制，熟练配置和使用工具。

- 6.1 模型工厂：`create_chat_model()` 与 `resolve_class()` 反射加载
- 6.2 内置 Provider：OpenAI / Anthropic / DeepSeek
- 6.3 自定义 Provider：接入任意 LangChain 集成
- 6.4 模型能力：思考模式（thinking）、视觉支持（vision）
- 6.5 工具三大来源：
  - 内置工具：`present_files`、`ask_clarification`、`view_image`、`review_skill_package`
  - 配置工具：`bash`、`read_file`、`write_file`、`str_replace`、`ls`、`web_search`、`web_fetch`
  - MCP 工具（M8 详述）
- 6.6 工具调用的沙箱边界

**实践**：配置一个本地模型（如 Ollama），并让 Agent 使用 `bash` 工具执行命令。

---

## 高级篇

### M7 · 技能系统：开发你的第一个 Skill

**学习目标**：理解技能机制，能编写并发布自定义技能。

- 7.1 技能是什么：可按需加载的指令包（SKILL.md）
- 7.2 SKILL.md 规范：name / description / license / allowed-tools / 正文
- 7.3 技能目录：`skills/public/`、`skills/custom/`、集成技能包
- 7.4 技能加载机制：懒加载发现、slash 激活
- 7.5 内置技能速览：skill-reviewer 质量评审
- 7.6 编写第一个技能：从需求到 SKILL.md
- 7.7 技能的安全边界：allowed-tools 权限控制

**实践**：编写一个"代码审查助手"技能，限定只能使用 read_file，在对话中激活并验证。

---

### M8 · MCP 集成：接入外部工具与服务

**学习目标**：能配置 MCP 服务，让 Agent 使用外部能力。

- 8.1 MCP（Model Context Protocol）是什么
- 8.2 DeerFlow 的 MCP 架构：MultiServerMCPClient
- 8.3 传输协议：stdio / SSE / HTTP
- 8.4 配置 MCP 服务：extensions_config.json 中的 mcpServers
- 8.5 常用 MCP 服务：filesystem、github、postgres、brave-search、puppeteer
- 8.6 长时任务（McpTaskService）：为什么需要独立任务运行时
- 8.7 MCP 的进程隔离与运行时 env 解析

**实践**：接入 GitHub MCP 服务，让 Agent 读取指定仓库的 README。

---

### M9 · 沙箱系统：隔离执行

**学习目标**：理解沙箱模型，能选择和配置合适的沙箱。

- 9.1 为什么需要沙箱：Agent 代码执行的安全边界
- 9.2 SandboxProvider 抽象：acquire / get / release
- 9.3 LocalSandboxProvider：本地直接执行（仅开发）
- 9.4 AioSandboxProvider：Docker 容器隔离（生产推荐）
- 9.5 其他 Provider：OpenSandbox、E2B、Boxlite
- 9.6 虚拟路径映射：`/mnt/user-data/{workspace,uploads,outputs}`
- 9.7 沙箱工具：`execute_command`、`read_file`、`write_file`、`list_dir`
- 9.8 路径遍历防护与上传安全

**实践**：切换到 Docker 沙箱模式，验证 Agent 在容器内执行 `ls` 只能看到映射目录。

---

### M10 · 记忆系统：让 Agent 记住你

**学习目标**：理解记忆机制，配置记忆后端，利用上下文压缩。

- 10.1 记忆 vs 上下文窗口的区别
- 10.2 记忆流程：提取 → 队列 → 检索 → 合并
- 10.3 存储后端选择：
  - Markdown（本地文件）
  - SQLite / PostgreSQL（数据库）
  - Mem0 / Honcho / OpenViking（第三方）
- 10.4 记忆的用户隔离：每用户独立
- 10.5 上下文压缩（Summarization）：触发条件与策略
- 10.6 手动压缩：`POST /api/threads/{id}/compact`
- 10.7 记忆提示注入防护

**实践**：开启记忆功能，跨两个 Thread 验证 Agent 能记住用户偏好。

---

### M11 · 子 Agent 委派与定时任务

**学习目标**：掌握多 Agent 协作和后台自动化任务。

- 11.1 子 Agent 是什么：Lead Agent 的后台委派
- 11.2 SubagentExecutor：execution_id 与 tool_call_id 的双 ID 设计
- 11.3 子 Agent 生命周期：polling / cancellation / timeout
- 11.4 子 Agent 的 SSE 命名空间：`values|<ns>`
- 11.5 定时任务（Scheduler）：
  - `/workspace/scheduled-tasks` 页面
  - `config.yaml → scheduler.enabled`
  - 复用 Gateway run 生命周期
  - 非交互运行：移除 `ask_clarification`
  - 状态机：queued → launching → running → terminal
- 11.6 多实例调度器：Postgres + 租约 + 心跳

**实践**：创建一个定时任务，每天定时让 Agent 生成工作日报。

---

## 专家篇

### M12 · IM 通道接入：让 Agent 无处不在

**学习目标**：将 DeerFlow 接入外部 IM 平台。

- 12.1 通道架构：所有 IM 复用同一个 Gateway Agent Runtime
- 12.2 飞书接入：应用配置、事件订阅、消息处理
- 12.3 Slack / Telegram / Discord 接入
- 12.4 钉钉 / 企业微信 / 微信接入
- 12.5 GitHub 与 Buzz(Nostr) 特殊通道
- 12.6 通道的用户身份与文件存储隔离
- 12.7 通道运行时配置：runtime_config_store
- 12.8 消息去重与积压保护

**实践**：接入飞书机器人，在飞书中与 DeerFlow Agent 对话并上传文件。

---

### M13 · 扩展开发：构建 Python 插件

**学习目标**：使用 extension-api 开发可插拔的 DeerFlow 扩展。

- 13.1 扩展体系：`deerflow-extension-api` 契约
- 13.2 扩展能贡献什么：
  - 中间件（middleware）
  - 任务生命周期（task lifecycle）
  - 系统模型观察者（system model observer）
  - Gateway 服务（service）
  - FastAPI HTTP 路由（router）
- 13.3 扩展的加载与注册：`plugins:` 配置
- 13.4 扩展的放置保证与隔离机制
- 13.5 参考扩展：`examples/deerflow-extension-example/`
- 13.6 扩展管理：`deerflow extensions install/list/enable/disable/remove`
- 13.7 扩展的安全注意事项：需重启、以 Gateway 权限执行

**实践**：参考示例扩展，开发一个添加自定义中间件的扩展并加载运行。

---

### M14 · 部署运维与安全

**学习目标**：将 DeerFlow 部署到生产环境并保障安全。

- 14.1 启动模式总览：本地开发 / Docker Dev / Docker Prod
- 14.2 Docker 生产部署：`make up`，Nginx 为唯一入口
- 14.3 绑定地址安全：默认 loopback（`127.0.0.1`），非 loopback 需显式配置
- 14.4 配置文件挂载：config.yaml 只读，extensions_config.json 可写
- 14.5 五层隔离模型：
  - 线程隔离（每 Thread 独立数据目录）
  - 沙箱隔离（Docker AioSandboxProvider）
  - MCP 隔离（独立进程）
  - 入口隔离（Nginx 唯一对外，8001 不发布）
  - 上传隔离（路径遍历校验 + 原子替换）
- 14.6 认证与授权：OIDC / 内部认证 / 工具级权限过滤
- 14.7 健康检查与日志：Gateway `/health`、`make docker-logs`
- 14.8 数据备份与迁移：检查点、记忆、Thread 数据
- 14.9 常见生产问题排查

**实践**：用 Docker Compose 部署生产环境，验证只有 2026 端口对外暴露。

---

## 附录

### A. 命令速查表
| 命令 | 作用 |
|---|---|
| `make setup` | 交互式安装向导 |
| `make doctor` | 环境与配置诊断 |
| `make config` | 生成配置文件 |
| `make install` | 安装全部依赖 |
| `make dev` | 开发模式启动全部服务 |
| `make up` | Docker 生产部署 |
| `make test` | 后端测试 |
| `pnpm check` | 前端 lint + 类型检查 |

### B. 核心文件路径速查
- 架构总览：[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- 后端指南：[backend/AGENTS.md](../backend/AGENTS.md)
- 前端指南：[frontend/AGENTS.md](../frontend/AGENTS.md)
- 配置说明：[backend/docs/CONFIGURATION.md](../backend/docs/CONFIGURATION.md)
- API 参考：[backend/docs/API.md](../backend/docs/API.md)

### C. 学习路线建议
- **只想用**：M0 → M1 → M2 → M4
- **想配置好**：上述 + M5 → M6 → M7 → M8
- **想开发扩展**：上述 + M3 → M9 → M10 → M11 → M13
- **想部署运维**：M3 → M5 → M9 → M12 → M14
