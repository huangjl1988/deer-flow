# DeerFlow API Gateway 接口文档

> 本文档基于 `backend/app/gateway/routers/` 下的路由定义自动整理，覆盖全部 **26 个路由模块、约 140+ 个端点**。
>
> - **基础地址**：`http://<host>:<port>`（开发环境默认 Nginx 入口 `http://localhost:2026`，Gateway 直接端口 `8001`）
> - **认证方式**：Cookie / Session（`AuthMiddleware`），部分端点需管理员权限
> - **API 文档**：当 `enable_docs=true` 时，可访问 `/docs`（Swagger UI）和 `/openapi.json`
> - **路径参数约定**：`{thread_id}`、`{run_id}`、`{batch_id}`、`{task_id}` 等为占位符

---

## 目录

1. [健康检查 Health](#1-健康检查-health)
2. [认证 Auth](#2-认证-auth)
3. [线程 Threads](#3-线程-threads)
4. [运行 Runs](#4-运行-runs)
5. [消息与历史 Messages & History](#5-消息与历史-messages--history)
6. [反馈 Feedback](#6-反馈-feedback)
7. [模型 Models](#7-模型-models)
8. [MCP 配置](#8-mcp-配置)
9. [MCP 任务](#9-mcp-任务)
10. [记忆 Memory](#10-记忆-memory)
11. [技能 Skills](#11-技能-skills)
12. [集成 Integrations](#12-集成-integrations)
13. [智能体 Agents](#13-智能体-agents)
14. [子智能体 Subagents](#14-子智能体-subagents)
15. [子智能体批次 Subagent Batches](#15-子智能体批次-subagent-batches)
16. [产物 Artifacts](#16-产物-artifacts)
17. [浏览器 Browser](#17-浏览器-browser)
18. [上传 Uploads](#18-上传-uploads)
19. [定时任务 Scheduled Tasks](#19-定时任务-scheduled-tasks)
20. [建议 Suggestions](#20-建议-suggestions)
21. [输入润色 Input Polish](#21-输入润色-input-polish)
22. [控制台 Console](#22-控制台-console)
23. [频道连接 Channel Connections](#23-频道连接-channel-connections)
24. [频道 Channels](#24-频道-channels)
25. [助手兼容 Assistants Compat](#25-助手兼容-assistants-compat)
26. [特性开关 Features](#26-特性开关-features)
27. [无状态运行 Stateless Runs](#27-无状态运行-stateless-runs)
28. [Webhooks](#28-webhooks)

---

## 1. 健康检查 Health

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 服务健康检查，返回 `{"status":"healthy","service":"deer-flow-gateway"}` |

---

## 2. 认证 Auth

**前缀**：`/api/v1/auth` ｜ **标签**：`auth`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/auth/login/local` | 本地账号登录 |
| POST | `/api/v1/auth/register` | 注册新用户（角色固定为 `user`） |
| POST | `/api/v1/auth/logout` | 登出，清除 Cookie |
| POST | `/api/v1/auth/change-password` | 修改当前用户密码 |
| GET | `/api/v1/auth/me` | 获取当前登录用户信息 |
| GET | `/api/v1/auth/setup-status` | 检查是否已创建管理员账号（`needs_setup`） |
| POST | `/api/v1/auth/initialize` | 首次初始化时创建管理员账号 |
| GET | `/api/v1/auth/providers` | 列出已启用的 SSO 登录提供商 |
| GET | `/api/v1/auth/oauth/{provider}` | 发起 OAuth 登录重定向 |
| GET | `/api/v1/auth/callback/{provider}` | OAuth 回调处理 |

---

## 3. 线程 Threads

**前缀**：`/api/threads` ｜ **标签**：`threads`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/threads` | 创建新线程 |
| POST | `/api/threads/search` | 搜索 / 列出线程 |
| GET | `/api/threads/{thread_id}` | 获取线程详情 |
| PATCH | `/api/threads/{thread_id}` | 更新线程元数据 |
| DELETE | `/api/threads/{thread_id}` | 删除线程及其持久化文件数据 |
| POST | `/api/threads/{thread_id}/branches` | 从已完成的助手回合创建线程分支 |
| GET | `/api/threads/{thread_id}/goal` | 获取线程目标（Claude 风格） |
| PUT | `/api/threads/{thread_id}/goal` | 设置 / 替换线程目标 |
| DELETE | `/api/threads/{thread_id}/goal` | 清除线程目标 |
| POST | `/api/threads/{thread_id}/compact` | 手动压缩旧上下文，保留可见历史 |
| GET | `/api/threads/{thread_id}/state` | 获取线程最新物化状态 |
| POST | `/api/threads/{thread_id}/state` | 更新线程状态字段 |
| POST | `/api/threads/{thread_id}/history` | 获取线程历史记录 |

---

## 4. 运行 Runs

**前缀**：`/api/threads` ｜ **标签**：`runs`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/threads/{thread_id}/runs` | 创建后台运行（立即返回 run_id） |
| POST | `/api/threads/{thread_id}/runs/stream` | 创建运行并通过 SSE 流式输出事件 |
| POST | `/api/threads/{thread_id}/runs/wait` | 创建运行并阻塞直到完成，返回最终状态 |
| GET | `/api/threads/{thread_id}/runs` | 列出线程的所有运行 |
| GET | `/api/threads/{thread_id}/runs/{run_id}` | 获取指定运行详情 |
| POST | `/api/threads/{thread_id}/runs/{run_id}/cancel` | 取消运行 |
| GET | `/api/threads/{thread_id}/runs/{run_id}/join` | 加入已有运行的 SSE 流 |
| GET | `/api/threads/{thread_id}/runs/{run_id}/stream` | 以 GET 方式流式获取已有运行事件 |
| POST | `/api/threads/{thread_id}/runs/{run_id}/stream` | 以 POST 方式流式获取已有运行事件 |
| POST | `/api/threads/{thread_id}/runs/regenerate/prepare` | 准备重新生成运行 |
| POST | `/api/threads/{thread_id}/runs/edit-regenerate/prepare` | 准备编辑后重新生成运行 |

---

## 5. 消息与历史 Messages & History

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/threads/{thread_id}/messages` | 列出线程消息 |
| GET | `/api/threads/{thread_id}/messages/page` | 分页列出线程消息 |
| GET | `/api/threads/{thread_id}/runs/{run_id}/messages` | 列出指定运行的消息 |
| GET | `/api/threads/{thread_id}/runs/{run_id}/events` | 列出指定运行的事件 |
| GET | `/api/threads/{thread_id}/runs/{run_id}/workspace-changes` | 获取运行产生的工作区变更 |
| GET | `/api/threads/{thread_id}/token-usage` | 获取线程的 Token 用量统计 |

---

## 6. 反馈 Feedback

**前缀**：`/api/threads` ｜ **标签**：`feedback`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/threads/{thread_id}/runs/{run_id}/feedback` | 创建反馈 |
| PUT | `/api/threads/{thread_id}/runs/{run_id}/feedback` | 更新（upsert）反馈 |
| DELETE | `/api/threads/{thread_id}/runs/{run_id}/feedback` | 删除运行的全部反馈 |
| GET | `/api/threads/{thread_id}/runs/{run_id}/feedback` | 列出运行的所有反馈 |
| GET | `/api/threads/{thread_id}/runs/{run_id}/feedback/stats` | 获取反馈统计 |
| DELETE | `/api/threads/{thread_id}/runs/{run_id}/feedback/{feedback_id}` | 删除指定反馈 |

---

## 7. 模型 Models

**前缀**：`/api` ｜ **标签**：`models`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/models` | 列出所有可用 AI 模型 |
| GET | `/api/models/{model_name}` | 获取指定模型详情 |

---

## 8. MCP 配置

**前缀**：`/api` ｜ **标签**：`mcp`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/mcp/config` | 获取 MCP 服务器配置 |
| PUT | `/api/mcp/config` | 全量更新 MCP 配置 |
| PATCH | `/api/mcp/config` | 更新 MCP 服务器启用状态（部分更新） |
| POST | `/api/mcp/cache/reset` | 重置 MCP 工具缓存 |

---

## 9. MCP 任务

**前缀**：`/api/threads/{thread_id}/mcp-tasks` ｜ **标签**：`mcp-tasks`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/threads/{thread_id}/mcp-tasks` | 列出线程的 MCP 任务 |
| GET | `/api/threads/{thread_id}/mcp-tasks/{task_id}` | 获取指定 MCP 任务详情 |
| POST | `/api/threads/{thread_id}/mcp-tasks/{task_id}/cancel` | 取消 MCP 任务 |

---

## 10. 记忆 Memory

**前缀**：`/api` ｜ **标签**：`memory`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/memory` | 获取全局记忆数据 |
| POST | `/api/memory/reload` | 重新加载记忆 |
| DELETE | `/api/memory` | 清空记忆 |
| POST | `/api/memory/facts` | 新增记忆事实 |
| PATCH | `/api/memory/facts/{fact_id}` | 更新指定记忆事实 |
| DELETE | `/api/memory/facts/{fact_id}` | 删除指定记忆事实 |
| GET | `/api/memory/export` | 导出记忆数据 |
| POST | `/api/memory/import` | 导入记忆数据 |
| GET | `/api/memory/config` | 获取记忆模块配置 |
| GET | `/api/memory/status` | 获取记忆模块运行状态 |

---

## 11. 技能 Skills

**前缀**：`/api` ｜ **标签**：`skills`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/skills` | 列出所有技能 |
| GET | `/api/skills/{skill_name}` | 获取指定技能详情 |
| PUT | `/api/skills/{skill_name}` | 更新技能配置 |
| POST | `/api/skills/install` | 安装技能 |
| POST | `/api/skills/reload` | 重新加载技能 |
| GET | `/api/skills/custom` | 列出自定义技能 |
| GET | `/api/skills/custom/{skill_name}` | 获取自定义技能内容 |
| PUT | `/api/skills/custom/{skill_name}` | 编辑自定义技能 |
| DELETE | `/api/skills/custom/{skill_name}` | 删除自定义技能 |
| GET | `/api/skills/custom/{skill_name}/history` | 获取自定义技能历史版本 |
| POST | `/api/skills/custom/{skill_name}/rollback` | 回滚自定义技能到指定版本 |

---

## 12. 集成 Integrations

**前缀**：`/api/integrations` ｜ **标签**：`integrations`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/integrations/lark/status` | 获取飞书 / Lark 集成状态 |
| POST | `/api/integrations/lark/install` | 安装飞书技能包 |
| POST | `/api/integrations/lark/config/start` | 开始飞书应用配置 |
| POST | `/api/integrations/lark/config/complete` | 完成飞书应用配置 |
| POST | `/api/integrations/lark/config/credentials` | 切换飞书应用凭证 |
| POST | `/api/integrations/lark/auth/start` | 开始飞书浏览器授权 |
| POST | `/api/integrations/lark/auth/complete` | 完成飞书浏览器授权 |

---

## 13. 智能体 Agents

**前缀**：`/api` ｜ **标签**：`agents`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/agents` | 列出自定义智能体 |
| GET | `/api/agents/check` | 校验智能体名称是否可用 |
| GET | `/api/agents/{name}` | 获取指定自定义智能体 |
| POST | `/api/agents` | 创建自定义智能体 |
| PUT | `/api/agents/{name}` | 更新自定义智能体 |
| DELETE | `/api/agents/{name}` | 删除自定义智能体 |
| GET | `/api/user-profile` | 获取用户配置 |
| PUT | `/api/user-profile` | 更新用户配置 |

---

## 14. 子智能体 Subagents

**前缀**：`/api/subagents` ｜ **标签**：`subagents`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/subagents` | 列出运行时子智能体目录 |
| POST | `/api/subagents` | 创建受管子智能体（管理员） |
| PUT | `/api/subagents/{name}` | 更新受管子智能体（管理员） |
| DELETE | `/api/subagents/{name}` | 删除受管子智能体（管理员） |

---

## 15. 子智能体批次 Subagent Batches

**前缀**：`/api/threads/{thread_id}/subagent-batches` ｜ **标签**：`subagent-batches`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/threads/{thread_id}/subagent-batches` | 列出线程的子智能体批次 |
| GET | `/api/threads/{thread_id}/subagent-batches/{batch_id}` | 获取批次详情 |
| GET | `/api/threads/{thread_id}/subagent-batches/{batch_id}/items` | 列出批次内的任务项 |
| POST | `/api/threads/{thread_id}/subagent-batches/{batch_id}/pause` | 暂停批次 |
| POST | `/api/threads/{thread_id}/subagent-batches/{batch_id}/resume` | 恢复批次 |
| POST | `/api/threads/{thread_id}/subagent-batches/{batch_id}/cancel` | 取消批次 |
| POST | `/api/threads/{thread_id}/subagent-batches/{batch_id}/items/{item_id}/retry` | 重试批次中的单个任务项 |
| GET | `/api/threads/{thread_id}/subagent-batches/{batch_id}/results.jsonl` | 导出批次结果（JSONL 流） |

---

## 16. 产物 Artifacts

**前缀**：`/api` ｜ **标签**：`artifacts`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/threads/{thread_id}/artifacts/{path:path}` | 获取 AI 生成的产物文件（文本可内联，活跃网页内容强制下载） |
| PUT | `/api/threads/{thread_id}/artifacts/{path:path}` | 更新产物文件 |

---

## 17. 浏览器 Browser

**前缀**：`/api` ｜ **标签**：`browser`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/threads/{thread_id}/browser/navigate` | 导航实时浏览器会话 |
| WS | `/api/threads/{thread_id}/browser/stream` | 双向实时浏览器流（WebSocket） |

---

## 18. 上传 Uploads

**前缀**：`/api/threads/{thread_id}/uploads` ｜ **标签**：`uploads`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/threads/{thread_id}/uploads` | 上传文件到线程 |
| GET | `/api/threads/{thread_id}/uploads/limits` | 获取上传限制配置 |
| GET | `/api/threads/{thread_id}/uploads/list` | 列出线程已上传的文件 |
| DELETE | `/api/threads/{thread_id}/uploads/{filename}` | 删除线程中的指定文件 |

---

## 19. 定时任务 Scheduled Tasks

**前缀**：`/api` ｜ **标签**：`scheduled-tasks`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/scheduled-tasks` | 列出所有定时任务 |
| POST | `/api/scheduled-tasks` | 创建定时任务 |
| GET | `/api/scheduled-tasks/{task_id}` | 获取定时任务详情 |
| PATCH | `/api/scheduled-tasks/{task_id}` | 更新定时任务 |
| POST | `/api/scheduled-tasks/{task_id}/pause` | 暂停定时任务 |
| POST | `/api/scheduled-tasks/{task_id}/resume` | 恢复定时任务 |
| POST | `/api/scheduled-tasks/{task_id}/trigger` | 立即触发一次定时任务 |
| DELETE | `/api/scheduled-tasks/{task_id}` | 删除定时任务 |
| GET | `/api/scheduled-tasks/{task_id}/runs` | 列出定时任务的运行记录 |
| GET | `/api/threads/{thread_id}/scheduled-tasks` | 列出指定线程的定时任务 |

---

## 20. 建议 Suggestions

**前缀**：`/api` ｜ **标签**：`suggestions`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/suggestions/config` | 获取后续问题建议的全局配置 |
| POST | `/api/threads/{thread_id}/suggestions` | 基于最近对话上下文生成后续问题建议 |

---

## 21. 输入润色 Input Polish

**前缀**：`/api` ｜ **标签**：`input-polish`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/input-polish` | 润色用户在输入框中的草稿内容 |

---

## 22. 控制台 Console

**前缀**：`/api/console` ｜ **标签**：`console`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/console/stats` | 控制台统计数据（跨线程） |
| GET | `/api/console/runs` | 列出跨线程的运行 |
| GET | `/api/console/usage` | Token 用量随时间变化趋势 |

---

## 23. 频道连接 Channel Connections

**前缀**：`/api/channels` ｜ **标签**：`channel-connections`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/channels/providers` | 获取可用的 IM 频道提供商 |
| GET | `/api/channels/connections` | 获取已建立的频道连接 |
| DELETE | `/api/channels/connections/{connection_id}` | 断开指定频道连接 |
| POST | `/api/channels/{provider}/connect` | 连接指定频道提供商 |
| POST | `/api/channels/{provider}/runtime-config` | 配置频道提供商运行时参数 |
| DELETE | `/api/channels/{provider}/runtime-config` | 移除频道提供商运行时配置（管理员） |

---

## 24. 频道 Channels

**前缀**：`/api/channels` ｜ **标签**：`channels`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/channels/` | 获取所有 IM 频道的运行状态 |
| POST | `/api/channels/{name}/restart` | 重启指定 IM 频道（管理员） |

---

## 25. 助手兼容 Assistants Compat

**前缀**：`/api/assistants` ｜ **标签**：`assistants-compat`

> LangGraph Platform 兼容层（stub 实现）。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/assistants/search` | 搜索助手 |
| GET | `/api/assistants/{assistant_id}` | 获取指定助手 |
| GET | `/api/assistants/{assistant_id}/graph` | 获取助手的图结构 |
| GET | `/api/assistants/{assistant_id}/schemas` | 获取助手的输入 / 输出 / 状态 JSON Schema |

---

## 26. 特性开关 Features

**前缀**：`/api` ｜ **标签**：`features`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/features` | 列出系统特性开关状态 |

---

## 27. 无状态运行 Stateless Runs

**前缀**：`/api/runs` ｜ **标签**：`runs`

> 无需预先创建线程的运行接口。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/runs/stream` | 创建运行并通过 SSE 流式输出（无需线程） |
| POST | `/api/runs/wait` | 创建运行并阻塞直到完成（无需线程） |
| GET | `/api/runs/{run_id}/messages` | 获取无状态运行的消息 |
| GET | `/api/runs/{run_id}/feedback` | 获取无状态运行的反馈 |

---

## 28. Webhooks

**前缀**：`/api/webhooks` ｜ **标签**：`webhooks`

> 仅在配置了 `GITHUB_WEBHOOK_SECRET`（或设置 `DEER_FLOW_ALLOW_UNVERIFIED_GITHUB_WEBHOOKS=1`）时挂载。通过 `X-Hub-Signature-256` HMAC 校验真实性，免认证 / CSRF。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/webhooks/github` | 接收 GitHub Webhook 事件 |

---

## 附录

### A. 路由模块文件清单

所有路由定义位于 `backend/app/gateway/routers/`：

| 模块 | 文件 | 前缀 |
|------|------|------|
| 模型 | `models.py` | `/api` |
| 特性 | `features.py` | `/api` |
| 控制台 | `console.py` | `/api/console` |
| MCP | `mcp.py` | `/api` |
| MCP 任务 | `mcp_tasks.py` | `/api/threads/{thread_id}/mcp-tasks` |
| 记忆 | `memory.py` | `/api` |
| 技能 | `skills.py` | `/api` |
| 集成 | `integrations.py` | `/api/integrations` |
| 产物 | `artifacts.py` | `/api` |
| 浏览器 | `browser.py` | `/api` |
| 上传 | `uploads.py` | `/api/threads/{thread_id}/uploads` |
| 线程 | `threads.py` | `/api/threads` |
| 定时任务 | `scheduled_tasks.py` | `/api` |
| 智能体 | `agents.py` | `/api` |
| 子智能体 | `subagents.py` | `/api/subagents` |
| 子智能体批次 | `subagent_batches.py` | `/api/threads/{thread_id}/subagent-batches` |
| 建议 | `suggestions.py` | `/api` |
| 输入润色 | `input_polish.py` | `/api` |
| 频道连接 | `channel_connections.py` | `/api/channels` |
| 频道 | `channels.py` | `/api/channels` |
| 助手兼容 | `assistants_compat.py` | `/api/assistants` |
| 认证 | `auth.py` | `/api/v1/auth` |
| 反馈 | `feedback.py` | `/api/threads` |
| 线程运行 | `thread_runs.py` | `/api/threads` |
| 无状态运行 | `runs.py` | `/api/runs` |
| Webhooks | `github_webhooks.py` | `/api/webhooks` |
| 健康检查 | `app.py` | `/health` |

### B. 权限说明

- 大多数端点使用 `@require_permission` 装饰器，校验资源权限（如 `threads:read` / `threads:write`）和线程所有权（`owner_check=True`）。
- 管理员专属操作（如管理技能、子智能体、频道重启）通过 `require_admin_user` 校验。
- 无状态运行接口使用 `runs:read` 权限。

### C. 特殊响应类型

| 类型 | 说明 | 涉及端点 |
|------|------|----------|
| `StreamingResponse` (SSE) | Server-Sent Events 流式输出 | `/runs/stream`、`/runs/wait` 的 join、`/subagent-batches/{id}/results.jsonl` |
| `WebSocket` | 双向实时通信 | `/threads/{thread_id}/browser/stream` |
| `StreamingResponse` (文件流) | 产物文件下载 | `/threads/{thread_id}/artifacts/{path:path}` |

---

*文档生成时间：基于当前代码库路由定义自动整理。具体请求 / 响应字段请参考 `/docs`（Swagger UI）或各路由文件中的 Pydantic 模型。*
