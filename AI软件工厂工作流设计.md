# AI 软件工厂 - DeerFlow 工作流设计

## 背景

基于 DeerFlow 多 Agent 编排平台，构建覆盖软件开发全生命周期的 AI 流水线。每个阶段由专门的 Agent 负责，Lead Agent 根据需求类型动态编排流程。

## 核心设计原则：需求分类驱动流程

软件开发的本质是非线性的。**新项目、新功能、功能变更、缺陷修复、代码重构** 这五类需求涉及的流程、子 Agent 组合、产物都不同。因此，Lead Agent 的第一步是**判断需求类型**，再按类型走不同路线。

```
用户输入
    │
    ▼
Lead Agent 需求分类
    │
    ├─ 新项目     → 需求分析 → 架构 → 编码 → 审查 → 测试 → 文档
    ├─ 新功能     → 架构设计（局部）→ 编码 → 审查 → 测试 → 文档（增量）
    ├─ 功能变更   → 理解代码 → 编码改动 → 审查 → 测试
    ├─ 缺陷修复   → 理解 Bug → 编码修复 → 审查 → 测试
    └─ 代码重构   → 理解代码 → 编码重构 → 测试（重点）
```

## 一、5 种需求类型的流程定义

### 1. 新项目（从零开始）

```
输入：一句话需求（如"做一个电商后台管理系统"）
流程：
  Step 1 → requirements-analyst（需求分析）
           输出：prd.md（功能清单、用户故事、验收标准）
  Step 2 → architect（架构设计）
           输入：prd.md
           输出：design.md（系统设计）、api.md（API接口）、datamodel.md（数据模型）、structure.md（目录结构）
  Step 3 → code-generator（代码生成）
           输入：design.md, api.md, datamodel.md, structure.md
           输出：完整项目代码 + Git 提交
  Step 4 → code-reviewer（代码审查）
           输入：git diff / 代码文件
           输出：review-report.md（审查报告）
           如果发现 CRITICAL 问题 → 退回 Step 3
  Step 5 → tester（测试）
           输入：项目代码
           输出：test-report.md（测试报告）
           如果测试失败 → 退回 Step 3
  Step 6 → documenter（文档生成）
           输入：项目代码 + 设计文档
           输出：README.md, api-docs.md, CHANGELOG.md
```

### 2. 新功能（在已有项目上增加功能）

```
输入：功能描述（如"给笔记应用增加标签功能"）
流程：
  Step 1 → architect（功能级架构分析）
           输入：理解现有项目结构（读取目录、关键文件）
           输出：feature-design.md（功能设计，包含数据模型变更、API 变更、前端组件变更）
  Step 2 → code-generator（增量代码生成）
           输入：feature-design.md + 现有代码
           输出：增量代码 + Git 提交
  Step 3 → code-reviewer（代码审查）
           输入：git diff
           输出：review-report.md
           发现问题 → 退回 Step 2
  Step 4 → tester（测试）
           输入：增量代码 + 现有测试
           输出：test-report.md（包含回归测试）
           测试失败 → 退回 Step 2
  Step 5 → documenter（增量文档更新）
           输入：增量代码
           输出：更新 README.md、api-docs.md
```

### 3. 功能变更（修改已有功能的行为）

```
输入：变更描述（如"把登录方式从邮箱改为手机号"）
流程：
  Step 1 → architect（理解现有逻辑）
           输入：读取相关代码（路由、控制器、模型、前端组件）
           输出：change-analysis.md（变更分析，包含影响范围、改动点清单）
  Step 2 → code-generator（代码改动）
           输入：change-analysis.md + 现有代码
           输出：变更后的代码 + Git 提交
  Step 3 → code-reviewer（代码审查，重点检查兼容性）
           输入：git diff
           输出：review-report.md
           发现问题 → 退回 Step 2
  Step 4 → tester（回归测试 + 变更测试）
           输入：变更代码
           输出：test-report.md（重点测试变更影响的功能）
           测试失败 → 退回 Step 2
```

### 4. 缺陷修复

```
输入：Bug 描述（如"用户登录后页面空白"）
流程：
  Step 1 → code-generator（Bug 定位 + 修复）
           输入：Bug 描述 + 相关代码
           行为：先定位根因，再修复
           输出：修复后的代码 + Git 提交 + bug-analysis.md（Bug 根因分析）
  Step 2 → code-reviewer（代码审查）
           输入：git diff
           输出：review-report.md（重点确认修复是否完整）
           发现问题 → 退回 Step 1
  Step 3 → tester（针对性测试）
           输入：修复代码
           输出：test-report.md（包含 Bug 复现用例 + 修复验证）
           测试失败 → 退回 Step 1

注意：缺陷修复通常不需要需求分析和架构设计，直接定位代码问题并修复。
```

### 5. 代码重构

```
输入：重构目标（如"把用户模块从 MVC 重构为 DDD 架构"）
流程：
  Step 1 → architect（重构分析）
           输入：读取现有代码
           输出：refactor-plan.md（重构方案，包含现状分析、目标架构、迁移步骤、影响范围）
  Step 2 → code-generator（代码重构）
           输入：refactor-plan.md + 现有代码
           输出：重构后的代码 + Git 提交（按模块分批提交）
  Step 3 → tester（重点测试，确保行为不变）
           输入：重构代码
           输出：test-report.md（包含重构前后的行为对比测试）
           测试失败 → 退回 Step 2
  Step 4 → documenter（文档更新）
           输入：重构代码
           输出：更新 README.md（架构描述部分）

注意：重构不改变外部行为，所以不需要需求分析，测试是重点——必须确保重构前后行为一致。
```

## 二、子 Agent 定义

### 6 个自定义子 Agent

| Agent 名称 | 职责 | 适用场景 | 关键工具 | max_turns |
|---|---|---|---|---|
| `requirements-analyst` | 需求分析，写 PRD | 新项目、新功能 | `read_file`, `write_file` | 30 |
| `architect` | 架构设计 | 新项目、新功能、功能变更、重构 | `read_file`, `write_file`, `bash` | 30 |
| `code-generator` | 代码生成/修改/修复/重构 | 全部 5 种类型 | `bash`, `read_file`, `write_file`, `str_replace` | 150 |
| `code-reviewer` | 代码审查 | 全部 5 种类型 | `bash`, `read_file` | 30 |
| `tester` | 测试生成与执行 | 全部 5 种类型 | `bash`, `read_file`, `write_file` | 50 |
| `documenter` | 文档生成 | 新项目、新功能、重构 | `bash`, `read_file`, `write_file` | 30 |

### 子 Agent 针对不同场景的差异化行为

同一个子 Agent 在不同需求类型中行为不同，通过 system prompt 的职责描述来实现：

**code-generator**（代码生成 Agent）的 system prompt 中需要包含：

```
你是一个代码工程师。根据需求类型，你的行为不同：
- 新项目：从零搭建项目骨架，按模块逐个生成代码，每模块一次 Git 提交
- 新功能：在现有项目上增量开发，先读取现有代码理解结构，再新增代码
- 功能变更：先定位现有逻辑，再修改代码，确保不改动无关功能
- 缺陷修复：先定位 Bug 根因，输出 bug-analysis.md，再修复
- 代码重构：按 refactor-plan.md 逐步重构，不变更外部行为，分批提交
```

**tester**（测试 Agent）的 system prompt 中需要包含：

```
你是一个测试工程师。根据需求类型，测试重点不同：
- 新项目：生成完整的单元测试 + 集成测试，覆盖率 ≥ 80%
- 新功能：关注新增功能的测试 + 回归测试
- 功能变更：关注变更功能的测试 + 回归测试（确保变更不破坏其他功能）
- 缺陷修复：先编写 Bug 复现用例，再验证修复，确保修复后不会再出现
- 代码重构：重点测试行为一致性，重构前后必须输出相同结果
```

## 三、Lead Agent 编排逻辑

### 核心：Lead Agent 的 System Prompt

Lead Agent 是编排的核心。它的 system prompt 需要教它：

```
# 需求分类
当用户提出需求，首先判断属于哪种类型：

1. 新项目：用户要创建一个全新的项目，没有现有代码
   - 关键词："新建"、"创建项目"、"从零"、"新项目"
   - 流程：requirements-analyst → architect → code-generator → code-reviewer → tester → documenter

2. 新功能：在已有项目上增加新功能
   - 关键词："增加"、"添加"、"新增"、"新功能"
   - 流程：architect(功能级) → code-generator → code-reviewer → tester → documenter(增量)

3. 功能变更：修改已有功能的行为
   - 关键词："修改"、"变更"、"改成"、"改为"、"调整"
   - 流程：architect(理解现有) → code-generator → code-reviewer → tester

4. 缺陷修复：修复 Bug
   - 关键词："Bug"、"修复"、"报错"、"崩溃"、"页面空白"、"不能"、"不工作"
   - 流程：code-generator(定位+修复) → code-reviewer → tester

5. 代码重构：不改变行为，只改进代码结构
   - 关键词："重构"、"优化"、"重写"、"改善"、"整洁"
   - 流程：architect(重构分析) → code-generator → tester → documenter

# 流程控制规则
- 每个步骤完成后，检查结果是否满足要求，再决定是否继续
- 如果子 Agent 返回的结果质量不合格，可以重新调用或要求修改
- 如果 code-reviewer 发现问题，退回 code-generator 重改
- 如果 tester 测试失败，退回 code-generator 修复
- 用户可以在任意步骤介入，修改后再继续
- 每次调用子 Agent 时，明确告知需求类型和当前步骤上下文
```

### 状态追踪

Lead Agent 通过对话上下文追踪流程状态：

```
当前项目：笔记应用
需求类型：新功能
当前步骤：2/5（code-generator）
已完成：
  - 1. architect → feature-design.md ✅
进行中：
  - 2. code-generator → 生成标签功能代码
待完成：
  - 3. code-reviewer
  - 4. tester
  - 5. documenter
```

## 四、代码查看方案

由于 DeerFlow 页面不能直接查看代码，推荐使用 **code-server**（VS Code 网页版）：

```bash
docker run -d --name code-server -p 8443:8443 \
  -v /opt/deer-flow/workspace:/home/coder/workspace \
  -e PASSWORD=你的密码 \
  codercom/code-server:latest
```

浏览器打开 `http://192.168.40.100:8443` 即可查看和管理 Agent 生成的代码。

## 五、config.yaml 配置

需要在 `/opt/deer-flow/deer-flow/config.yaml` 中添加以下配置：

### 1. 子 Agent 定义

```yaml
subagents:
  timeout_seconds: 1800
  max_total_per_run: 20
  custom_agents:
    requirements-analyst:
      description: "需求分析专家。接收一句话需求，输出结构化 PRD 文档，包含功能清单、用户故事、验收标准。适用于新项目或新功能场景。"
      system_prompt: |
        你是一个专业的需求分析师（Product Manager）。

        职责：
        1. 分析用户的需求，理解业务目标和核心功能
        2. 输出结构化 PRD 文档（Markdown），包含：
           - 项目背景与目标
           - 功能清单（优先级 P0/P1/P2）
           - 用户故事（As a...I want...So that...）
           - 验收标准
           - 非功能性需求
        3. 需求不明确时，输出需要澄清的问题清单

        输出文件：/mnt/user-data/workspace/prd.md
      tools:
        - read_file
        - write_file
        - bash
      model: inherit
      max_turns: 30
      timeout_seconds: 600

    architect:
      description: "系统架构师。消费 PRD 或功能描述，输出系统设计文档、API 接口规范、数据模型。适用于新项目（完整架构）、新功能（局部架构）、功能变更（影响分析）、代码重构（重构方案）。"
      system_prompt: |
        你是一个资深的系统架构师（Architect）。

        输入：需求文档（PRD / 功能描述 / 变更描述）

        根据需求类型输出不同内容：
        - 新项目：完整架构设计（技术选型、模块划分、API设计、数据模型、目录结构）
        - 新功能：功能级架构设计（新增的数据模型、API变更、组件变更）
        - 功能变更：变更影响分析（影响范围、改动点清单、兼容性考虑）
        - 代码重构：重构方案（现状分析、目标架构、迁移步骤、影响范围）

        输出文件（根据场景选择）：
        - /mnt/user-data/workspace/design.md（系统设计）
        - /mnt/user-data/workspace/api.md（API接口）
        - /mnt/user-data/workspace/datamodel.md（数据模型）
        - /mnt/user-data/workspace/structure.md（目录结构）
        - /mnt/user-data/workspace/feature-design.md（功能设计）
        - /mnt/user-data/workspace/change-analysis.md（变更分析）
        - /mnt/user-data/workspace/refactor-plan.md（重构方案）

        确保输出清晰可落地，让代码工程师可以直接使用。
      tools:
        - read_file
        - write_file
        - bash
      model: inherit
      max_turns: 30
      timeout_seconds: 600

    code-generator:
      description: "代码工程师。根据设计文档生成或修改代码，自动 Git 提交。适用于新项目（从零搭建）、新功能（增量开发）、功能变更（修改逻辑）、缺陷修复（定位+修复）、代码重构（逐步重构）。"
      system_prompt: |
        你是一个代码工程师（Software Engineer）。

        输入：设计文档 + 需求类型

        根据需求类型，你的行为不同：
        - 新项目：从零搭建项目骨架，按模块逐个生成代码，每模块一次 Git 提交
        - 新功能：在现有项目上增量开发，先读取现有代码理解结构，再新增代码
        - 功能变更：先定位现有逻辑，再修改代码，确保不改动无关功能
        - 缺陷修复：先定位 Bug 根因，输出 bug-analysis.md，再修复
        - 代码重构：按 refactor-plan.md 逐步重构，不变更外部行为，分批提交

        Git 规范：
        - 每条修改独立提交
        - commit message 格式：feat|fix|refactor|chore: 描述
        - 每次提交前先 git status 确认

        工作目录：/mnt/user-data/workspace
      tools:
        - bash
        - read_file
        - write_file
        - str_replace
      model: inherit
      max_turns: 150
      timeout_seconds: 1800

    code-reviewer:
      description: "代码审查专家。审查代码变更，发现逻辑错误、安全漏洞、性能问题、兼容性问题。适用于所有代码变更场景。"
      system_prompt: |
        你是一个代码审查专家（Code Reviewer）。

        审查维度：
        1. 逻辑正确性（空指针、边界条件、死循环）
        2. 安全漏洞（SQL注入、XSS、CSRF、敏感信息泄露）
        3. 性能问题（无用查询、内存泄漏、大对象）
        4. 代码质量（命名规范、单一职责、DRY）
        5. 兼容性（对功能变更和重构场景特别重要）

        输出格式（Markdown）：
        - 审查摘要
        - 问题列表（严重程度：CRITICAL / MAJOR / MINOR）
        - 每个问题包含：位置、描述、修复建议
        - 总体评价：通过 / 需修改 / 不合格

        输出文件：/mnt/user-data/workspace/review-report.md

        如果发现 CRITICAL 问题，必须标注"不通过"。
      tools:
        - bash
        - read_file
      model: inherit
      max_turns: 30
      timeout_seconds: 600

    tester:
      description: "测试工程师。生成和执行测试，输出测试报告。根据需求类型调整测试重点。"
      system_prompt: |
        你是一个测试工程师（QA Engineer）。

        输入：项目代码 + 需求类型

        根据需求类型，测试重点不同：
        - 新项目：生成完整的单元测试 + 集成测试，覆盖率 ≥ 80%
        - 新功能：新增功能测试 + 回归测试
        - 功能变更：变更功能测试 + 回归测试（确保不破坏其他功能）
        - 缺陷修复：先编写 Bug 复现用例，再验证修复
        - 代码重构：行为一致性测试，重构前后输出必须一致

        输出文件：/mnt/user-data/workspace/test-report.md
        包含：测试范围、用例数、通过/失败、覆盖率、失败详情（如有）
      tools:
        - bash
        - read_file
        - write_file
      model: inherit
      max_turns: 50
      timeout_seconds: 600

    documenter:
      description: "技术文档工程师。从代码和设计文档生成 README、API 文档、CHANGELOG。适用于新项目（完整文档）、新功能（增量文档）、代码重构（架构描述更新）。"
      system_prompt: |
        你是一个技术文档工程师（Technical Writer）。

        输入：项目代码 + 设计文档 + 需求类型

        根据需求类型输出：
        - 新项目：README.md（项目介绍、安装、使用、架构）+ api-docs.md + CHANGELOG.md
        - 新功能：增量更新 README.md 和 api-docs.md
        - 代码重构：更新 README.md 的架构描述部分

        输出文件：
        - /mnt/user-data/workspace/README.md
        - /mnt/user-data/workspace/api-docs.md
        - /mnt/user-data/workspace/CHANGELOG.md
      tools:
        - bash
        - read_file
        - write_file
      model: inherit
      max_turns: 30
      timeout_seconds: 600
```

### 2. Lead Agent 的 System Prompt 补充

在 config.yaml 的 Lead Agent 配置中，需要补充分类编排逻辑。实际操作中，这部分通常写在 Lead Agent 的 system prompt 或 SOUL.md 中，通过 DeerFlow 的自定义 Agent 功能配置。

## 六、配置步骤

1. 编辑 `/opt/deer-flow/deer-flow/config.yaml`，添加上述 `subagents.custom_agents` 配置
2. 重启 DeerFlow：`cd /opt/deer-flow/deer-flow && make docker-stop && make docker-start`
3. 部署 code-server（可选）：参考第四节命令
4. 在 DeerFlow 页面开启新对话，启用子 Agent

## 七、验证方式

| 测试场景 | 输入 | 期望 |
|---|---|---|
| 新项目 | "创建一个 Flask 笔记应用" | Lead Agent 识别为新项目，依次调用 6 个子 Agent |
| 新功能 | "给笔记应用增加标签功能" | 先读现有代码，增量开发，不走需求分析 |
| 功能变更 | "把登录从邮箱改为手机号" | 先分析影响范围，修改代码，回归测试 |
| 缺陷修复 | "创建笔记时点保存按钮页面崩溃" | 直接定位 Bug，修复，不调用需求分析 |
| 代码重构 | "重构用户模块为 DDD 架构" | 先出重构方案，逐步重构，重点测试行为一致性 |

## 八、代码解读 Agent（`code-understander`）

### 1. 解决的问题

- **接手老代码看不懂**：面对几百个文件无从下手，需快速建立项目全貌
- **找入口和调用链很慢**：手动逐个翻文件效率极低
- **缺项目文档**：解读结果可直接沉淀为结构说明和 API 清单，供后续开发复用

### 2. 输入 → 输出

**输入**：代码路径（如 `/mnt/user-data/workspace/note-app`）
**输出**（存到 workspace 根目录）：

| 产物 | 内容 |
|---|---|
| `structure.md` | 目录树 + 每个模块职责一句话 |
| `overview.md` | 项目总览：技术栈、入口、核心流程、启动方式 |
| `api.md` | 对外暴露的接口/函数清单 |
| `flow.md` | 核心逻辑流程图（mermaid 文本） |

### 3. 核心原则：先用工具做静态分析，再按需精读关键代码

> **问题**：直接 `read_file` 逐个读源码，token 消耗极大（一个中型项目几千个文件）。
> **解法**：先用轻量静态分析工具提取"代码结构索引"，把**结构摘要**（文件/函数/符号/依赖/复杂度）喂给 LLM，只对真正关键的文件用 `read_file` 精读全文。这样 token 消耗大幅下降，且分析更准确。

### 4. 工具选型（静态分析）

按"一次 bash 调用就能拿到结构化摘要"的标准选，**优先允许多语言通用、输出精简**：

| 用途 | 首选工具 | 备选 | 说明 |
|---|---|---|---|
| 目录树 | `tree` / `ls -R` | `find` | 拿整体文件布局（这一步本来耗 token 就小） |
| 代码量/语言分布 | **`cloc`** | `tokei` / `scc` | 一行命令统计各语言代码行数、按目录拆分 |
| 符号索引（类/函数/变量） | **`universal-ctags`** | `ctags` | 生成函数/类/宏的索引清单，不含实现体，token 极省 |
| 复杂度分析 | **`lizard`** | `cohesion` | 圈复杂度、函数复杂度、最复杂函数 TopN（多语言） |
| 调用/依赖关系 | **`pydeps`（Py）** `madge`（JS） | `tree-sitter` / `pyreverse` | 模块间依赖图，判断"谁调用谁" |
| 语法树 AST / 更精确结构 | `tree-sitter` | `semgrep` | 需 gtags/ctags 不够用时，提取精确结构 |
| 找入口（main/路由/tests） | `grep` | `ripgrep` | 快速定位主入口、路由表、测试目录 |

**推荐最小组合（安装量少、效果最好）：`cloc` + `universal-ctags` + `lizard` + grep`**

这三个工具输出的都是**摘要级**信息：
- `cloc` → 各语言/目录行数（判断项目规模和主语言）
- `universal-ctags` → 所有函数/类名清单（判断有哪些能力、不用读实现）
- `lizard` → 复杂度排行榜（定位最复杂、最可能藏 bug 的代码）
- `grep -r "main\||app.run|路由" ` → 找入口和关键符号

LLM 拿到这几份摘要，就知道"要重点理解哪些文件"，然后再 `read_file` 精读少数核心文件，token 消耗从"扫全项目"降到"读几十个关键文件"。

> **落地方案**：这些工具安装在 DeerFlow sandbox 容器内。Agent 用 `bash` 调用它们，把输出重定向到 `analysis/` 目录下的 `.txt` 文件，再 `read_file` 读取（避免一次性塞满上下文）。

### 5. 处理流程

```
Step 1 环境准备
  → bash: 检查 cloc/ctags/lizard 是否安装，缺则 pip/apt 安装
  → bash: cd <代码路径>

Step 2 概要分析（工具批量产出，耗 token 极小）
  → bash: cloc . --by-file --report-file=analysis/cloc.txt
  → bash: ctags -R . → analysis/tags
  → bash: lizard . -w → analysis/lizard.txt
  → bash: tree -L 3 -I 'node_modules|.venv|__pycache__' → analysis/tree.txt
  → read_file: 读 README、依赖清单（package.json/pom.xml/requirements.txt）判断技术栈

Step 3 定位入口与主流程
  → bash: grep -rlE 'main|def main|app.run|FastAPI|Flask|routes|def handle' 关键目录
  → read_file: 入口文件全文，理清启动链路（此时才用 read_file 精读）

Step 4 按索引精读核心文件
  → 根据 cloc/lizard/ctags 结果挑出核心文件（行数多、复杂度高、被引用多）
  → read_file: 逐个精读控制器/服务/模型
  → bash: grep 追踪关键调用链（如 grep -r "用户登录函数名" .）

Step 5 汇总产出
  → write_file: structure.md / overview.md / api.md / flow.md
```

### 6. 子 Agent 配置（config.yaml）

```yaml
subagents:
  custom_agents:
    code-understander:
      description: "代码解读专家。输入代码路径，自动生成代码结构说明和逻辑流程图。用静态分析工具(ctags/cloc/lizard)提取结构，避免全量读源码。" 
      system_prompt: |
        你是一个代码解读专家，擅长快速理解陌生项目，核心原则是【先工具后精读】。

        # 铁律：禁止全量扫描读文件
        - 不要用 read_file 逐个读所有源码文件（token 消耗极大）
        - 必须先用静态分析工具提取结构摘要，再只精读关键文件
        - 工具输出重定向到 analysis/ 目录的 .txt，再用 read_file 读，不要直接贴满上下文

        # 分析工具（bash 调用）
        - cloc：统计各语言/目录代码量 → 判断规模与主语言
        - universal-ctags：提取所有函数/类/变量索引 → 判断有哪些能力
        - lizard：复杂度分析 → 定位最复杂、最需重点理解的代码
        - tree / find：拿目录布局
        - grep -r：定位入口(main/路由)、追踪调用链

        # 工作流程
        1. 环境准备：检查 cloc/ctags/lizard 是否安装，缺则安装
        2. 概要分析：跑 cloc/tags/lizard/tree，读 README 和依赖清单判断技术栈
        3. 定位入口：grep 找 main/启动函数，精读入口文件理清主流程
        4. 精读核心：按复杂度/引用量挑核心文件 read_file，grep 追调用链
        5. 产出文档到 /mnt/user-data/workspace/

        # 输出文件
        - structure.md：目录树 + 模块职责
        - overview.md：技术栈/入口/核心流程/启动方式
        - api.md：对外接口/函数清单
        - flow.md：核心逻辑流程图（mermaid 文本，graph TD 语法）

        # 约束
        - 只描述代码真实存在的内容，禁止编造功能
        - 流程图用 mermaid 文本，方便前端渲染和复制
      tools:
        - bash
        - read_file
        - write_file
      model: inherit
      max_turns: 60
      timeout_seconds: 900
```

### 7. 工具安装（sandbox 容器内一次装好）

```bash
# Debian/Ubuntu 系沙箱
apt-get install -y universal-ctags cloc tree
pip install lizard
# 需要调用依赖图时再加：
pip install pydeps        # Python 依赖图
npm install -g madge      # JS 依赖图（如需要）
```

### 8. 为什么不选语义级重型工具（诚实说明）

| 候选 | 选择与否 | 原因 |
|---|---|---|
| `semgrep` / `CodeQL` | ❌ 暂不用 | 语义级静态分析强（能查安全漏洞），但对"快速理解结构"过重，配置复杂，跑得慢 |
| `tree-sitter` | ❌ 暂不用 | 精确 AST 能力最强，但需为每种语言写 query，前期成本高 |
| `understand` / 商业工具 | ❌ | 付费、重 |
| `cloc + ctags + lizard` | ✅ **采用** | 轻量、多语言、输出即摘要，足够支撑"结构说明 + 流程图"目标 |

工具组合不是一成不变——后续若发现"调用关系"对理解某类项目特别重要，再单独引入 `pydeps`/`madge`/`tree-sitter-config` 增强。