-- =============================================================================
-- DeerFlow 数据库表结构 (PostgreSQL)
-- 生成时间: 2026-10-07
-- 说明: 本脚本基于 DeerFlow 项目的 Alembic 迁移 (0001~0016) 和 ORM 模型整理。
--       包含 17 张 DeerFlow 自有表 + 4 张 LangGraph checkpointer 表。
--       LangGraph 表由 LangGraph 运行时 (saver.setup()) 自动创建，
--       此处列出仅供参考，实际部署时不要手动创建。
-- 数据库: PostgreSQL (生产推荐)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. users — 用户表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              VARCHAR(36)   NOT NULL,            -- UUID 字符串
    email           VARCHAR(320)  NOT NULL,
    password_hash   VARCHAR(128),
    system_role     VARCHAR(16)   NOT NULL DEFAULT 'user',  -- admin | user
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    oauth_provider  VARCHAR(32),
    oauth_id        VARCHAR(128),
    needs_setup     BOOLEAN       NOT NULL DEFAULT FALSE,
    token_version   INTEGER       NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email);
-- 部分唯一索引: 同一 oauth_provider + oauth_id 只能有一个用户
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth_identity
    ON users (oauth_provider, oauth_id)
    WHERE oauth_provider IS NOT NULL AND oauth_id IS NOT NULL;

COMMENT ON TABLE users IS '用户账户表';
COMMENT ON COLUMN users.system_role IS '角色: admin | user';
COMMENT ON COLUMN users.needs_setup IS '是否需要完成初始设置';
COMMENT ON COLUMN users.token_version IS '令牌版本号, 用于使旧 token 失效';

-- -----------------------------------------------------------------------------
-- 2. threads_meta — 会话元数据表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS threads_meta (
    thread_id       VARCHAR(64)   NOT NULL,
    assistant_id    VARCHAR(128),
    user_id         VARCHAR(64),
    display_name    VARCHAR(256),
    status          VARCHAR(20)   NOT NULL DEFAULT 'idle',
    metadata_json   JSON          NOT NULL DEFAULT '{}'::json,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (thread_id)
);

CREATE INDEX IF NOT EXISTS ix_threads_meta_assistant_id ON threads_meta (assistant_id);
CREATE INDEX IF NOT EXISTS ix_threads_meta_user_id ON threads_meta (user_id);

COMMENT ON TABLE threads_meta IS '会话(线程)元数据';
COMMENT ON COLUMN threads_meta.status IS '会话状态: idle | busy | ...';

-- -----------------------------------------------------------------------------
-- 3. runs — 运行记录表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS runs (
    run_id                 VARCHAR(64)   NOT NULL,
    thread_id              VARCHAR(64)   NOT NULL,
    assistant_id           VARCHAR(128),
    user_id                VARCHAR(64),
    status                 VARCHAR(20)   NOT NULL DEFAULT 'pending',
    operation_kind         VARCHAR(32)   NOT NULL DEFAULT 'run',
    idempotency_key        VARCHAR(255),
    model_name             VARCHAR(128),
    multitask_strategy     VARCHAR(20)   NOT NULL DEFAULT 'reject',
    metadata_json          JSON          NOT NULL DEFAULT '{}'::json,
    kwargs_json            JSON          NOT NULL DEFAULT '{}'::json,
    error                  TEXT,
    stop_reason            VARCHAR(50),
    message_count          INTEGER       NOT NULL DEFAULT 0,
    first_human_message    TEXT,
    last_ai_message        TEXT,
    total_input_tokens     INTEGER       NOT NULL DEFAULT 0,
    total_output_tokens    INTEGER       NOT NULL DEFAULT 0,
    total_tokens           INTEGER       NOT NULL DEFAULT 0,
    llm_call_count         INTEGER       NOT NULL DEFAULT 0,
    lead_agent_tokens      INTEGER       NOT NULL DEFAULT 0,
    subagent_tokens        INTEGER       NOT NULL DEFAULT 0,
    middleware_tokens      INTEGER       NOT NULL DEFAULT 0,
    token_usage_by_model   JSON          NOT NULL DEFAULT '{}'::json,
    follow_up_to_run_id    VARCHAR(64),
    owner_worker_id        VARCHAR(128),
    lease_expires_at       TIMESTAMPTZ,
    cancel_action          VARCHAR(20),
    cancel_requested_at    TIMESTAMPTZ,
    created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_id)
);

CREATE INDEX IF NOT EXISTS ix_runs_thread_id ON runs (thread_id);
CREATE INDEX IF NOT EXISTS ix_runs_user_id ON runs (user_id);
CREATE INDEX IF NOT EXISTS ix_runs_thread_status ON runs (thread_id, status);
CREATE INDEX IF NOT EXISTS ix_runs_lease ON runs (lease_expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_runs_idempotency_key ON runs (idempotency_key);
-- 部分唯一索引: 同一线程最多只有一个 pending/running 的 run
CREATE UNIQUE INDEX IF NOT EXISTS uq_runs_thread_active
    ON runs (thread_id)
    WHERE status IN ('pending', 'running');

COMMENT ON TABLE runs IS 'Agent 运行记录';
COMMENT ON COLUMN runs.status IS 'pending | running | success | error | timeout | interrupted';
COMMENT ON COLUMN runs.operation_kind IS 'run | compact | checkpoint_write | ...';
COMMENT ON COLUMN runs.multitask_strategy IS 'reject | interrupt | ...';
COMMENT ON COLUMN runs.stop_reason IS '运行停止原因';
COMMENT ON COLUMN runs.owner_worker_id IS '多 worker 部署时持有该 run 的 worker 标识';
COMMENT ON COLUMN runs.lease_expires_at IS 'run 租约过期时间';
COMMENT ON COLUMN runs.cancel_action IS '取消动作: cancel | rollback';

-- -----------------------------------------------------------------------------
-- 4. run_events — 运行事件表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS run_events (
    id              SERIAL        NOT NULL,
    thread_id       VARCHAR(64)   NOT NULL,
    run_id          VARCHAR(64)   NOT NULL,
    user_id         VARCHAR(64),
    event_type      VARCHAR(32)   NOT NULL,
    category        VARCHAR(16)   NOT NULL,
    content         TEXT          NOT NULL DEFAULT '',
    event_metadata  JSON          NOT NULL DEFAULT '{}'::json,
    seq             INTEGER       NOT NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT uq_events_thread_seq UNIQUE (thread_id, seq)
);

CREATE INDEX IF NOT EXISTS ix_events_run ON run_events (thread_id, run_id, seq);
CREATE INDEX IF NOT EXISTS ix_events_thread_cat_seq ON run_events (thread_id, category, seq);
CREATE INDEX IF NOT EXISTS ix_run_events_user_id ON run_events (user_id);

COMMENT ON TABLE run_events IS '运行事件流 (消息、工具调用、状态变更等)';
COMMENT ON COLUMN run_events.seq IS '线程内事件序列号, 单调递增';

-- -----------------------------------------------------------------------------
-- 5. feedback — 用户反馈表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback (
    feedback_id  VARCHAR(64)  NOT NULL,
    run_id       VARCHAR(64)  NOT NULL,
    thread_id    VARCHAR(64)  NOT NULL,
    user_id      VARCHAR(64),
    message_id   VARCHAR(64),
    rating       INTEGER      NOT NULL,
    comment      TEXT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (feedback_id),
    CONSTRAINT uq_feedback_thread_run_user UNIQUE (thread_id, run_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_feedback_run_id ON feedback (run_id);
CREATE INDEX IF NOT EXISTS ix_feedback_thread_id ON feedback (thread_id);
CREATE INDEX IF NOT EXISTS ix_feedback_user_id ON feedback (user_id);

COMMENT ON TABLE feedback IS '用户对运行结果的反馈';
COMMENT ON COLUMN feedback.rating IS '+1 (赞) | -1 (踩)';

-- -----------------------------------------------------------------------------
-- 6. agents — 自定义 Agent 表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents (
    id          VARCHAR(64)   NOT NULL,
    user_id     VARCHAR(64)   NOT NULL,
    name        VARCHAR(128)  NOT NULL,
    config      JSON          NOT NULL DEFAULT '{}'::json,
    soul        TEXT          NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT uq_agents_user_name UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS ix_agents_user_id ON agents (user_id);

COMMENT ON TABLE agents IS '用户自定义 Agent 配置';
COMMENT ON COLUMN agents.config IS '完整 AgentConfig JSON 文档 (不含 name)';
COMMENT ON COLUMN agents.soul IS 'Agent 人设/灵魂提示词';

-- -----------------------------------------------------------------------------
-- 7. scheduled_tasks — 定时任务表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id               VARCHAR(64)   NOT NULL,
    user_id          VARCHAR(64)   NOT NULL,
    thread_id        VARCHAR(64),
    context_mode     VARCHAR(32)   NOT NULL DEFAULT 'fresh_thread_per_run',
    assistant_id     VARCHAR(128),
    title            VARCHAR(255)  NOT NULL,
    prompt           TEXT          NOT NULL,
    schedule_type    VARCHAR(16)   NOT NULL,
    schedule_spec    JSON          NOT NULL DEFAULT '{}'::json,
    timezone         VARCHAR(64)   NOT NULL,
    status           VARCHAR(16)   NOT NULL DEFAULT 'enabled',
    overlap_policy   VARCHAR(16)   NOT NULL DEFAULT 'enqueue',
    next_run_at      TIMESTAMPTZ,
    last_run_at      TIMESTAMPTZ,
    last_run_id      VARCHAR(64),
    last_thread_id   VARCHAR(64),
    last_error       TEXT,
    lease_owner      VARCHAR(128),
    lease_expires_at TIMESTAMPTZ,
    run_count        INTEGER       NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_scheduled_tasks_user_id ON scheduled_tasks (user_id);
CREATE INDEX IF NOT EXISTS ix_scheduled_tasks_thread_id ON scheduled_tasks (thread_id);
CREATE INDEX IF NOT EXISTS ix_scheduled_tasks_status ON scheduled_tasks (status);
CREATE INDEX IF NOT EXISTS ix_scheduled_tasks_next_run_at ON scheduled_tasks (next_run_at);

COMMENT ON TABLE scheduled_tasks IS '定时任务定义';
COMMENT ON COLUMN scheduled_tasks.context_mode IS 'fresh_thread_per_run | reuse_thread';
COMMENT ON COLUMN scheduled_tasks.schedule_type IS 'cron | interval | once';
COMMENT ON COLUMN scheduled_tasks.status IS 'enabled | paused | disabled';
COMMENT ON COLUMN scheduled_tasks.overlap_policy IS 'enqueue | skip';

-- -----------------------------------------------------------------------------
-- 8. scheduled_task_runs — 定时任务运行记录表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduled_task_runs (
    id                VARCHAR(64)   NOT NULL,
    task_id           VARCHAR(64)   NOT NULL,
    thread_id         VARCHAR(64)   NOT NULL,
    run_id            VARCHAR(64),
    scheduled_for     TIMESTAMPTZ   NOT NULL,
    trigger           VARCHAR(16)   NOT NULL,
    status            VARCHAR(16)   NOT NULL,
    error             TEXT,
    lease_owner       VARCHAR(128),
    lease_expires_at  TIMESTAMPTZ,
    attempt_count     INTEGER       NOT NULL DEFAULT 0,
    started_at        TIMESTAMPTZ,
    finished_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_scheduled_task_runs_task_id ON scheduled_task_runs (task_id);
CREATE INDEX IF NOT EXISTS ix_scheduled_task_runs_thread_id ON scheduled_task_runs (thread_id);
CREATE INDEX IF NOT EXISTS ix_scheduled_task_runs_status ON scheduled_task_runs (status);
-- 部分唯一索引: 同一任务最多只有一个非终态 (queued/launching/running) 的运行
CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_task_run_active
    ON scheduled_task_runs (task_id)
    WHERE status IN ('queued', 'launching', 'running');

COMMENT ON TABLE scheduled_task_runs IS '定时任务的每次执行记录';
COMMENT ON COLUMN scheduled_task_runs.trigger IS 'scheduled | manual';
COMMENT ON COLUMN scheduled_task_runs.status IS 'queued | launching | running | success | failed | interrupted';

-- -----------------------------------------------------------------------------
-- 9. channel_connections — IM 渠道连接表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_connections (
    id                    VARCHAR(64)   NOT NULL,
    owner_user_id         VARCHAR(64)   NOT NULL,
    provider              VARCHAR(32)   NOT NULL,
    status                VARCHAR(32)   NOT NULL DEFAULT 'connected',
    external_account_id   VARCHAR(128)  NOT NULL DEFAULT '',
    external_account_name VARCHAR(256),
    workspace_id          VARCHAR(128)  NOT NULL DEFAULT '',
    workspace_name        VARCHAR(256),
    bot_user_id           VARCHAR(128),
    scopes_json           JSON          NOT NULL DEFAULT '[]'::json,
    capabilities_json     JSON          NOT NULL DEFAULT '{}'::json,
    metadata_json         JSON          NOT NULL DEFAULT '{}'::json,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    last_seen_at          TIMESTAMPTZ,
    last_error_at         TIMESTAMPTZ,
    PRIMARY KEY (id),
    CONSTRAINT uq_channel_connection_owner_provider_identity
        UNIQUE (owner_user_id, provider, external_account_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS ix_channel_connections_owner_user_id ON channel_connections (owner_user_id);
CREATE INDEX IF NOT EXISTS ix_channel_connections_provider ON channel_connections (provider);
CREATE INDEX IF NOT EXISTS idx_channel_connections_event_lookup
    ON channel_connections (provider, workspace_id, bot_user_id);
-- 部分唯一索引: 同一外部身份最多只有一个非 revoked 的连接
CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_connection_active_identity
    ON channel_connections (provider, external_account_id, workspace_id)
    WHERE status != 'revoked';

COMMENT ON TABLE channel_connections IS 'IM 渠道 (飞书/Slack/Telegram 等) 的 OAuth 连接';
COMMENT ON COLUMN channel_connections.provider IS 'feishu | slack | telegram | discord | dingtalk';
COMMENT ON COLUMN channel_connections.status IS 'connected | disconnected | revoked';

-- -----------------------------------------------------------------------------
-- 10. channel_credentials — 渠道凭证表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_credentials (
    connection_id           VARCHAR(64)   NOT NULL,
    encrypted_access_token  TEXT,
    encrypted_refresh_token TEXT,
    token_type              VARCHAR(32),
    expires_at              TIMESTAMPTZ,
    refresh_expires_at      TIMESTAMPTZ,
    encrypted_extra_json    TEXT,
    version                 INTEGER       NOT NULL DEFAULT 1,
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (connection_id),
    CONSTRAINT fk_channel_credentials_connection
        FOREIGN KEY (connection_id) REFERENCES channel_connections (id) ON DELETE CASCADE
);

COMMENT ON TABLE channel_credentials IS 'IM 渠道加密存储的 OAuth 凭证 (与 channel_connections 一对一)';

-- -----------------------------------------------------------------------------
-- 11. channel_oauth_states — 渠道 OAuth 状态表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_oauth_states (
    state_hash            VARCHAR(128)  NOT NULL,
    owner_user_id         VARCHAR(64)   NOT NULL,
    provider              VARCHAR(32)   NOT NULL,
    code_verifier_encrypted TEXT,
    nonce_hash            VARCHAR(128),
    redirect_after        TEXT,
    requested_scopes_json JSON          NOT NULL DEFAULT '[]'::json,
    metadata_json         JSON          NOT NULL DEFAULT '{}'::json,
    expires_at            TIMESTAMPTZ   NOT NULL,
    consumed_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (state_hash)
);

CREATE INDEX IF NOT EXISTS ix_channel_oauth_states_owner_user_id ON channel_oauth_states (owner_user_id);
CREATE INDEX IF NOT EXISTS ix_channel_oauth_states_provider ON channel_oauth_states (provider);

COMMENT ON TABLE channel_oauth_states IS 'IM 渠道 OAuth 流程的临时状态 (防 CSRF)';

-- -----------------------------------------------------------------------------
-- 12. channel_conversations — 渠道会话映射表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_conversations (
    id                      VARCHAR(64)   NOT NULL,
    connection_id           VARCHAR(64)   NOT NULL,
    owner_user_id           VARCHAR(64)   NOT NULL,
    provider                VARCHAR(32)   NOT NULL,
    external_conversation_id VARCHAR(128) NOT NULL,
    external_topic_id       VARCHAR(128)  NOT NULL DEFAULT '',
    thread_id               VARCHAR(64)   NOT NULL,
    created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_channel_conversations_connection
        FOREIGN KEY (connection_id) REFERENCES channel_connections (id) ON DELETE CASCADE,
    CONSTRAINT uq_channel_conversation_connection_external
        UNIQUE (connection_id, external_conversation_id, external_topic_id)
);

CREATE INDEX IF NOT EXISTS ix_channel_conversations_connection_id ON channel_conversations (connection_id);
CREATE INDEX IF NOT EXISTS ix_channel_conversations_owner_user_id ON channel_conversations (owner_user_id);
CREATE INDEX IF NOT EXISTS ix_channel_conversations_provider ON channel_conversations (provider);
CREATE INDEX IF NOT EXISTS ix_channel_conversations_thread_id ON channel_conversations (thread_id);

COMMENT ON TABLE channel_conversations IS 'IM 渠道外部会话到 DeerFlow 内部 thread 的映射';

-- -----------------------------------------------------------------------------
-- 13. webhook_deliveries — Webhook 去重表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    channel       VARCHAR(64)    NOT NULL,
    workspace_id  VARCHAR(512)   NOT NULL,
    chat_id       VARCHAR(512)   NOT NULL,
    message_id    VARCHAR(1024)  NOT NULL,
    first_seen    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    PRIMARY KEY (channel, workspace_id, chat_id, message_id)
);

CREATE INDEX IF NOT EXISTS ix_webhook_deliveries_first_seen ON webhook_deliveries (first_seen);

COMMENT ON TABLE webhook_deliveries IS '跨 Pod 的入站 Webhook 去重记录 (防止重复处理)';

-- -----------------------------------------------------------------------------
-- 14. mcp_tasks — MCP 长时任务表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mcp_tasks (
    id                              VARCHAR(64)   NOT NULL,
    user_id                         VARCHAR(64)   NOT NULL,
    thread_id                       VARCHAR(64)   NOT NULL,
    run_id                          VARCHAR(64),
    tool_call_id                    VARCHAR(128),
    server_name                     VARCHAR(128)  NOT NULL,
    driver_name                     VARCHAR(64)   NOT NULL,
    remote_task_id                  VARCHAR(255)  NOT NULL,
    task_name                       VARCHAR(255)  NOT NULL,
    status                          VARCHAR(32)   NOT NULL,
    result                          JSON,
    result_preview                  TEXT,
    result_truncated                BOOLEAN       NOT NULL DEFAULT FALSE,
    result_artifact                 JSON,
    error                           TEXT,
    input_required                  JSON,
    driver_data                     JSON          NOT NULL DEFAULT '{}'::json,
    notification_status             VARCHAR(16)   NOT NULL DEFAULT 'none',
    event_fingerprint               VARCHAR(64),
    event_version                   INTEGER       NOT NULL DEFAULT 0,
    notified_version                INTEGER       NOT NULL DEFAULT 0,
    dispatch_version                INTEGER,
    dispatch_attempt                INTEGER       NOT NULL DEFAULT 0,
    dispatch_event                  JSON,
    notification_run_id             VARCHAR(64),
    notification_error              TEXT,
    notification_attempt_count      INTEGER       NOT NULL DEFAULT 0,
    next_notification_at            TIMESTAMPTZ,
    notification_lease_owner        VARCHAR(128),
    notification_lease_expires_at   TIMESTAMPTZ,
    next_poll_at                    TIMESTAMPTZ,
    last_polled_at                  TIMESTAMPTZ,
    last_poll_error                 TEXT,
    poll_attempt_count              INTEGER       NOT NULL DEFAULT 0,
    consecutive_poll_error_count    INTEGER       NOT NULL DEFAULT 0,
    lease_owner                     VARCHAR(128),
    lease_expires_at                TIMESTAMPTZ,
    cancel_requested_at             TIMESTAMPTZ,
    cancel_attempt_count            INTEGER       NOT NULL DEFAULT 0,
    next_cancel_at                  TIMESTAMPTZ,
    last_cancel_error               TEXT,
    completed_at                    TIMESTAMPTZ,
    created_at                      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT uq_mcp_tasks_user_server_remote
        UNIQUE (user_id, server_name, remote_task_id)
);

CREATE INDEX IF NOT EXISTS ix_mcp_tasks_user_id ON mcp_tasks (user_id);
CREATE INDEX IF NOT EXISTS ix_mcp_tasks_thread_id ON mcp_tasks (thread_id);
CREATE INDEX IF NOT EXISTS ix_mcp_tasks_status ON mcp_tasks (status);
CREATE INDEX IF NOT EXISTS ix_mcp_tasks_notification_status ON mcp_tasks (notification_status);
CREATE INDEX IF NOT EXISTS ix_mcp_tasks_next_poll_at ON mcp_tasks (next_poll_at);
CREATE INDEX IF NOT EXISTS ix_mcp_tasks_thread_created ON mcp_tasks (thread_id, created_at);
CREATE INDEX IF NOT EXISTS ix_mcp_tasks_due ON mcp_tasks (status, next_poll_at);
CREATE INDEX IF NOT EXISTS ix_mcp_tasks_notification_due ON mcp_tasks (notification_status, next_notification_at);
CREATE INDEX IF NOT EXISTS ix_mcp_tasks_cancel_due ON mcp_tasks (cancel_requested_at, next_cancel_at);

COMMENT ON TABLE mcp_tasks IS 'MCP 长时任务 (异步远程任务) 的持久化状态';
COMMENT ON COLUMN mcp_tasks.status IS 'pending | running | completed | failed | cancelled';
COMMENT ON COLUMN mcp_tasks.notification_status IS 'none | pending | delivered | dead_letter';

-- -----------------------------------------------------------------------------
-- 15. managed_subagents — 托管子 Agent 表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS managed_subagents (
    id          VARCHAR(64)   NOT NULL,
    name        VARCHAR(128)  NOT NULL,
    definition  JSON          NOT NULL DEFAULT '{}'::json,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT uq_managed_subagents_name UNIQUE (name)
);

COMMENT ON TABLE managed_subagents IS '部署级别的托管子 Agent 定义 (全局共享)';

-- -----------------------------------------------------------------------------
-- 16. subagent_batches — 子 Agent 批处理表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subagent_batches (
    id                VARCHAR(64)   NOT NULL,
    user_id           VARCHAR(64)   NOT NULL,
    thread_id         VARCHAR(64)   NOT NULL,
    run_id            VARCHAR(64),
    tool_call_id      VARCHAR(128),
    submission_key    VARCHAR(256)  NOT NULL,
    title             VARCHAR(256)  NOT NULL,
    subagent_type     VARCHAR(128)  NOT NULL,
    status            VARCHAR(24)   NOT NULL,
    total_items       INTEGER       NOT NULL,
    max_live_items    INTEGER       NOT NULL,
    max_running_items INTEGER       NOT NULL,
    max_attempts      INTEGER       NOT NULL,
    execution_spec    JSON          NOT NULL DEFAULT '{}'::json,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    completed_at      TIMESTAMPTZ,
    PRIMARY KEY (id),
    CONSTRAINT uq_subagent_batches_user_submission UNIQUE (user_id, submission_key)
);

CREATE INDEX IF NOT EXISTS ix_subagent_batches_user_id ON subagent_batches (user_id);
CREATE INDEX IF NOT EXISTS ix_subagent_batches_thread_id ON subagent_batches (thread_id);
CREATE INDEX IF NOT EXISTS ix_subagent_batches_status ON subagent_batches (status);
CREATE INDEX IF NOT EXISTS ix_subagent_batches_thread_created ON subagent_batches (thread_id, created_at);

COMMENT ON TABLE subagent_batches IS '子 Agent 批处理任务 (一次提交多个 item 并行执行)';

-- -----------------------------------------------------------------------------
-- 17. subagent_batch_items — 子 Agent 批处理项表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subagent_batch_items (
    id                  VARCHAR(64)   NOT NULL,
    batch_id            VARCHAR(64)   NOT NULL,
    item_key            VARCHAR(128)  NOT NULL,
    position            INTEGER       NOT NULL,
    prompt              TEXT          NOT NULL,
    status              VARCHAR(24)   NOT NULL,
    attempt             INTEGER       NOT NULL DEFAULT 0,
    lease_owner         VARCHAR(128),
    lease_expires_at    TIMESTAMPTZ,
    cancel_requested_at TIMESTAMPTZ,
    model_name          VARCHAR(128),
    result              TEXT,
    result_preview      TEXT,
    result_truncated    BOOLEAN       NOT NULL DEFAULT FALSE,
    error               TEXT,
    stop_reason         VARCHAR(64),
    token_usage         JSON,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_subagent_batch_items_batch
        FOREIGN KEY (batch_id) REFERENCES subagent_batches (id) ON DELETE CASCADE,
    CONSTRAINT uq_subagent_batch_items_key UNIQUE (batch_id, item_key),
    CONSTRAINT uq_subagent_batch_items_position UNIQUE (batch_id, position)
);

CREATE INDEX IF NOT EXISTS ix_subagent_batch_items_batch_id ON subagent_batch_items (batch_id);
CREATE INDEX IF NOT EXISTS ix_subagent_batch_items_status ON subagent_batch_items (status);
CREATE INDEX IF NOT EXISTS ix_subagent_batch_items_claim
    ON subagent_batch_items (status, lease_expires_at, batch_id);

COMMENT ON TABLE subagent_batch_items IS '子 Agent 批处理中的单个执行项';

-- =============================================================================
-- LangGraph Checkpointer 表 (由 LangGraph 运行时自动创建, 仅供参考)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- LG-1. checkpoints — 检查点元数据表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkpoints (
    thread_id     VARCHAR(255)  NOT NULL,
    checkpoint_ns VARCHAR(255)  NOT NULL DEFAULT '',
    checkpoint_id VARCHAR(255)  NOT NULL,
    parent_checkpoint_id VARCHAR(255),
    checkpoint    JSONB         NOT NULL,
    metadata      JSONB         NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

COMMENT ON TABLE checkpoints IS 'LangGraph 检查点 (由 LangGraph 创建和管理)';

-- -----------------------------------------------------------------------------
-- LG-2. checkpoint_blobs — 检查点大字段表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkpoint_blobs (
    thread_id        VARCHAR(255)  NOT NULL,
    checkpoint_ns    VARCHAR(255)  NOT NULL DEFAULT '',
    channel          VARCHAR(255)  NOT NULL,
    version          VARCHAR(255)  NOT NULL,
    type             VARCHAR(255)  NOT NULL,
    blob             BYTEA         NOT NULL,
    PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);

COMMENT ON TABLE checkpoint_blobs IS 'LangGraph 检查点大值 (二进制) (由 LangGraph 创建和管理)';

-- -----------------------------------------------------------------------------
-- LG-3. checkpoint_writes — 检查点写入队列表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkpoint_writes (
    thread_id        VARCHAR(255)  NOT NULL,
    checkpoint_ns    VARCHAR(255)  NOT NULL DEFAULT '',
    checkpoint_id    VARCHAR(255)  NOT NULL,
    channel          VARCHAR(255)  NOT NULL,
    version          VARCHAR(255)  NOT NULL,
    type             VARCHAR(255)  NOT NULL,
    blob             BYTEA         NOT NULL,
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, channel, version)
);

COMMENT ON TABLE checkpoint_writes IS 'LangGraph 增量通道的待写入数据 (由 LangGraph 创建和管理)';

-- -----------------------------------------------------------------------------
-- LG-4. checkpoint_migrations — 检查点迁移版本表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkpoint_migrations (
    id    INTEGER NOT NULL,
    name  VARCHAR(255),
    applied TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE checkpoint_migrations IS 'LangGraph 检查点 schema 迁移记录 (由 LangGraph 创建和管理)';
