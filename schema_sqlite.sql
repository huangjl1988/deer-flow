-- =============================================================================
-- DeerFlow 数据库表结构 (SQLite)
-- 生成时间: 2026-10-07
-- 说明: 本脚本基于 DeerFlow 项目的 Alembic 迁移 (0001~0016) 和 ORM 模型整理。
--       包含 17 张 DeerFlow 自有表 + 4 张 LangGraph checkpointer 表。
--       LangGraph 表由 LangGraph 运行时 (saver.setup()) 自动创建，
--       此处列出仅供参考，实际部署时不要手动创建。
-- 数据库: SQLite (单节点部署)
-- =============================================================================

PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=30000;

-- -----------------------------------------------------------------------------
-- 1. users — 用户表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              TEXT          NOT NULL,
    email           TEXT          NOT NULL,
    password_hash   TEXT,
    system_role     TEXT          NOT NULL DEFAULT 'user',
    created_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    oauth_provider  TEXT,
    oauth_id        TEXT,
    needs_setup     INTEGER       NOT NULL DEFAULT 0,
    token_version   INTEGER       NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth_identity
    ON users (oauth_provider, oauth_id)
    WHERE oauth_provider IS NOT NULL AND oauth_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. threads_meta — 会话元数据表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS threads_meta (
    thread_id       TEXT          NOT NULL,
    assistant_id    TEXT,
    user_id         TEXT,
    display_name    TEXT,
    status          TEXT          NOT NULL DEFAULT 'idle',
    metadata_json   TEXT          NOT NULL DEFAULT '{}',
    created_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (thread_id)
);

CREATE INDEX IF NOT EXISTS ix_threads_meta_assistant_id ON threads_meta (assistant_id);
CREATE INDEX IF NOT EXISTS ix_threads_meta_user_id ON threads_meta (user_id);

-- -----------------------------------------------------------------------------
-- 3. runs — 运行记录表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS runs (
    run_id                 TEXT          NOT NULL,
    thread_id              TEXT          NOT NULL,
    assistant_id           TEXT,
    user_id                TEXT,
    status                 TEXT          NOT NULL DEFAULT 'pending',
    operation_kind         TEXT          NOT NULL DEFAULT 'run',
    idempotency_key        TEXT,
    model_name             TEXT,
    multitask_strategy     TEXT          NOT NULL DEFAULT 'reject',
    metadata_json          TEXT          NOT NULL DEFAULT '{}',
    kwargs_json            TEXT          NOT NULL DEFAULT '{}',
    error                  TEXT,
    stop_reason            TEXT,
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
    token_usage_by_model   TEXT          NOT NULL DEFAULT '{}',
    follow_up_to_run_id    TEXT,
    owner_worker_id        TEXT,
    lease_expires_at       DATETIME,
    cancel_action          TEXT,
    cancel_requested_at    DATETIME,
    created_at             DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at             DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (run_id)
);

CREATE INDEX IF NOT EXISTS ix_runs_thread_id ON runs (thread_id);
CREATE INDEX IF NOT EXISTS ix_runs_user_id ON runs (user_id);
CREATE INDEX IF NOT EXISTS ix_runs_thread_status ON runs (thread_id, status);
CREATE INDEX IF NOT EXISTS ix_runs_lease ON runs (lease_expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_runs_idempotency_key ON runs (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_runs_thread_active
    ON runs (thread_id)
    WHERE status IN ('pending', 'running');

-- -----------------------------------------------------------------------------
-- 4. run_events — 运行事件表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS run_events (
    id              INTEGER       NOT NULL PRIMARY KEY AUTOINCREMENT,
    thread_id       TEXT          NOT NULL,
    run_id          TEXT          NOT NULL,
    user_id         TEXT,
    event_type      TEXT          NOT NULL,
    category        TEXT          NOT NULL,
    content         TEXT          NOT NULL DEFAULT '',
    event_metadata  TEXT          NOT NULL DEFAULT '{}',
    seq             INTEGER       NOT NULL,
    created_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT uq_events_thread_seq UNIQUE (thread_id, seq)
);

CREATE INDEX IF NOT EXISTS ix_events_run ON run_events (thread_id, run_id, seq);
CREATE INDEX IF NOT EXISTS ix_events_thread_cat_seq ON run_events (thread_id, category, seq);
CREATE INDEX IF NOT EXISTS ix_run_events_user_id ON run_events (user_id);

-- -----------------------------------------------------------------------------
-- 5. feedback — 用户反馈表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback (
    feedback_id  TEXT         NOT NULL,
    run_id       TEXT         NOT NULL,
    thread_id    TEXT         NOT NULL,
    user_id      TEXT,
    message_id   TEXT,
    rating       INTEGER      NOT NULL,
    comment      TEXT,
    created_at   DATETIME     NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (feedback_id),
    CONSTRAINT uq_feedback_thread_run_user UNIQUE (thread_id, run_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_feedback_run_id ON feedback (run_id);
CREATE INDEX IF NOT EXISTS ix_feedback_thread_id ON feedback (thread_id);
CREATE INDEX IF NOT EXISTS ix_feedback_user_id ON feedback (user_id);

-- -----------------------------------------------------------------------------
-- 6. agents — 自定义 Agent 表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents (
    id          TEXT          NOT NULL,
    user_id     TEXT          NOT NULL,
    name        TEXT          NOT NULL,
    config      TEXT          NOT NULL DEFAULT '{}',
    soul        TEXT          NOT NULL DEFAULT '',
    created_at  DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at  DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id),
    CONSTRAINT uq_agents_user_name UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS ix_agents_user_id ON agents (user_id);

-- -----------------------------------------------------------------------------
-- 7. scheduled_tasks — 定时任务表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id               TEXT          NOT NULL,
    user_id          TEXT          NOT NULL,
    thread_id        TEXT,
    context_mode     TEXT          NOT NULL DEFAULT 'fresh_thread_per_run',
    assistant_id     TEXT,
    title            TEXT          NOT NULL,
    prompt           TEXT          NOT NULL,
    schedule_type    TEXT          NOT NULL,
    schedule_spec    TEXT          NOT NULL DEFAULT '{}',
    timezone         TEXT          NOT NULL,
    status           TEXT          NOT NULL DEFAULT 'enabled',
    overlap_policy   TEXT          NOT NULL DEFAULT 'enqueue',
    next_run_at      DATETIME,
    last_run_at      DATETIME,
    last_run_id      TEXT,
    last_thread_id   TEXT,
    last_error       TEXT,
    lease_owner      TEXT,
    lease_expires_at DATETIME,
    run_count        INTEGER       NOT NULL DEFAULT 0,
    created_at       DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at       DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_scheduled_tasks_user_id ON scheduled_tasks (user_id);
CREATE INDEX IF NOT EXISTS ix_scheduled_tasks_thread_id ON scheduled_tasks (thread_id);
CREATE INDEX IF NOT EXISTS ix_scheduled_tasks_status ON scheduled_tasks (status);
CREATE INDEX IF NOT EXISTS ix_scheduled_tasks_next_run_at ON scheduled_tasks (next_run_at);

-- -----------------------------------------------------------------------------
-- 8. scheduled_task_runs — 定时任务运行记录表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduled_task_runs (
    id                TEXT          NOT NULL,
    task_id           TEXT          NOT NULL,
    thread_id         TEXT          NOT NULL,
    run_id            TEXT,
    scheduled_for     DATETIME      NOT NULL,
    trigger           TEXT          NOT NULL,
    status            TEXT          NOT NULL,
    error             TEXT,
    lease_owner       TEXT,
    lease_expires_at  DATETIME,
    attempt_count     INTEGER       NOT NULL DEFAULT 0,
    started_at        DATETIME,
    finished_at       DATETIME,
    created_at        DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_scheduled_task_runs_task_id ON scheduled_task_runs (task_id);
CREATE INDEX IF NOT EXISTS ix_scheduled_task_runs_thread_id ON scheduled_task_runs (thread_id);
CREATE INDEX IF NOT EXISTS ix_scheduled_task_runs_status ON scheduled_task_runs (status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_task_run_active
    ON scheduled_task_runs (task_id)
    WHERE status IN ('queued', 'launching', 'running');

-- -----------------------------------------------------------------------------
-- 9. channel_connections — IM 渠道连接表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_connections (
    id                    TEXT          NOT NULL,
    owner_user_id         TEXT          NOT NULL,
    provider              TEXT          NOT NULL,
    status                TEXT          NOT NULL DEFAULT 'connected',
    external_account_id   TEXT          NOT NULL DEFAULT '',
    external_account_name TEXT,
    workspace_id          TEXT          NOT NULL DEFAULT '',
    workspace_name        TEXT,
    bot_user_id           TEXT,
    scopes_json           TEXT          NOT NULL DEFAULT '[]',
    capabilities_json     TEXT          NOT NULL DEFAULT '{}',
    metadata_json         TEXT          NOT NULL DEFAULT '{}',
    created_at            DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at            DATETIME      NOT NULL DEFAULT (datetime('now')),
    last_seen_at          DATETIME,
    last_error_at         DATETIME,
    PRIMARY KEY (id),
    CONSTRAINT uq_channel_connection_owner_provider_identity
        UNIQUE (owner_user_id, provider, external_account_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS ix_channel_connections_owner_user_id ON channel_connections (owner_user_id);
CREATE INDEX IF NOT EXISTS ix_channel_connections_provider ON channel_connections (provider);
CREATE INDEX IF NOT EXISTS idx_channel_connections_event_lookup
    ON channel_connections (provider, workspace_id, bot_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_connection_active_identity
    ON channel_connections (provider, external_account_id, workspace_id)
    WHERE status != 'revoked';

-- -----------------------------------------------------------------------------
-- 10. channel_credentials — 渠道凭证表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_credentials (
    connection_id           TEXT          NOT NULL,
    encrypted_access_token  TEXT,
    encrypted_refresh_token TEXT,
    token_type              TEXT,
    expires_at              DATETIME,
    refresh_expires_at      DATETIME,
    encrypted_extra_json    TEXT,
    version                 INTEGER       NOT NULL DEFAULT 1,
    updated_at              DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (connection_id),
    CONSTRAINT fk_channel_credentials_connection
        FOREIGN KEY (connection_id) REFERENCES channel_connections (id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 11. channel_oauth_states — 渠道 OAuth 状态表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_oauth_states (
    state_hash              TEXT          NOT NULL,
    owner_user_id           TEXT          NOT NULL,
    provider                TEXT          NOT NULL,
    code_verifier_encrypted TEXT,
    nonce_hash              TEXT,
    redirect_after          TEXT,
    requested_scopes_json   TEXT          NOT NULL DEFAULT '[]',
    metadata_json           TEXT          NOT NULL DEFAULT '{}',
    expires_at              DATETIME      NOT NULL,
    consumed_at             DATETIME,
    created_at              DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (state_hash)
);

CREATE INDEX IF NOT EXISTS ix_channel_oauth_states_owner_user_id ON channel_oauth_states (owner_user_id);
CREATE INDEX IF NOT EXISTS ix_channel_oauth_states_provider ON channel_oauth_states (provider);

-- -----------------------------------------------------------------------------
-- 12. channel_conversations — 渠道会话映射表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_conversations (
    id                      TEXT          NOT NULL,
    connection_id           TEXT          NOT NULL,
    owner_user_id           TEXT          NOT NULL,
    provider                TEXT          NOT NULL,
    external_conversation_id TEXT         NOT NULL,
    external_topic_id       TEXT          NOT NULL DEFAULT '',
    thread_id               TEXT          NOT NULL,
    created_at              DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at              DATETIME      NOT NULL DEFAULT (datetime('now')),
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

-- -----------------------------------------------------------------------------
-- 13. webhook_deliveries — Webhook 去重表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    channel       TEXT    NOT NULL,
    workspace_id  TEXT    NOT NULL,
    chat_id       TEXT    NOT NULL,
    message_id    TEXT    NOT NULL,
    first_seen    DATETIME NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (channel, workspace_id, chat_id, message_id)
);

CREATE INDEX IF NOT EXISTS ix_webhook_deliveries_first_seen ON webhook_deliveries (first_seen);

-- -----------------------------------------------------------------------------
-- 14. mcp_tasks — MCP 长时任务表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mcp_tasks (
    id                              TEXT          NOT NULL,
    user_id                         TEXT          NOT NULL,
    thread_id                       TEXT          NOT NULL,
    run_id                          TEXT,
    tool_call_id                    TEXT,
    server_name                     TEXT          NOT NULL,
    driver_name                     TEXT          NOT NULL,
    remote_task_id                  TEXT          NOT NULL,
    task_name                       TEXT          NOT NULL,
    status                          TEXT          NOT NULL,
    result                          TEXT,
    result_preview                  TEXT,
    result_truncated                INTEGER       NOT NULL DEFAULT 0,
    result_artifact                 TEXT,
    error                           TEXT,
    input_required                  TEXT,
    driver_data                     TEXT          NOT NULL DEFAULT '{}',
    notification_status             TEXT          NOT NULL DEFAULT 'none',
    event_fingerprint               TEXT,
    event_version                   INTEGER       NOT NULL DEFAULT 0,
    notified_version                INTEGER       NOT NULL DEFAULT 0,
    dispatch_version                INTEGER,
    dispatch_attempt                INTEGER       NOT NULL DEFAULT 0,
    dispatch_event                  TEXT,
    notification_run_id             TEXT,
    notification_error              TEXT,
    notification_attempt_count      INTEGER       NOT NULL DEFAULT 0,
    next_notification_at            DATETIME,
    notification_lease_owner        TEXT,
    notification_lease_expires_at   DATETIME,
    next_poll_at                    DATETIME,
    last_polled_at                  DATETIME,
    last_poll_error                 TEXT,
    poll_attempt_count              INTEGER       NOT NULL DEFAULT 0,
    consecutive_poll_error_count    INTEGER       NOT NULL DEFAULT 0,
    lease_owner                     TEXT,
    lease_expires_at                DATETIME,
    cancel_requested_at             DATETIME,
    cancel_attempt_count            INTEGER       NOT NULL DEFAULT 0,
    next_cancel_at                  DATETIME,
    last_cancel_error               TEXT,
    completed_at                    DATETIME,
    created_at                      DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at                      DATETIME      NOT NULL DEFAULT (datetime('now')),
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

-- -----------------------------------------------------------------------------
-- 15. managed_subagents — 托管子 Agent 表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS managed_subagents (
    id          TEXT          NOT NULL,
    name        TEXT          NOT NULL,
    definition  TEXT          NOT NULL DEFAULT '{}',
    created_at  DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at  DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id),
    CONSTRAINT uq_managed_subagents_name UNIQUE (name)
);

-- -----------------------------------------------------------------------------
-- 16. subagent_batches — 子 Agent 批处理表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subagent_batches (
    id                TEXT          NOT NULL,
    user_id           TEXT          NOT NULL,
    thread_id         TEXT          NOT NULL,
    run_id            TEXT,
    tool_call_id      TEXT,
    submission_key    TEXT          NOT NULL,
    title             TEXT          NOT NULL,
    subagent_type     TEXT          NOT NULL,
    status            TEXT          NOT NULL,
    total_items       INTEGER       NOT NULL,
    max_live_items    INTEGER       NOT NULL,
    max_running_items INTEGER       NOT NULL,
    max_attempts      INTEGER       NOT NULL,
    execution_spec    TEXT          NOT NULL DEFAULT '{}',
    created_at        DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at        DATETIME      NOT NULL DEFAULT (datetime('now')),
    completed_at      DATETIME,
    PRIMARY KEY (id),
    CONSTRAINT uq_subagent_batches_user_submission UNIQUE (user_id, submission_key)
);

CREATE INDEX IF NOT EXISTS ix_subagent_batches_user_id ON subagent_batches (user_id);
CREATE INDEX IF NOT EXISTS ix_subagent_batches_thread_id ON subagent_batches (thread_id);
CREATE INDEX IF NOT EXISTS ix_subagent_batches_status ON subagent_batches (status);
CREATE INDEX IF NOT EXISTS ix_subagent_batches_thread_created ON subagent_batches (thread_id, created_at);

-- -----------------------------------------------------------------------------
-- 17. subagent_batch_items — 子 Agent 批处理项表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subagent_batch_items (
    id                  TEXT          NOT NULL,
    batch_id            TEXT          NOT NULL,
    item_key            TEXT          NOT NULL,
    position            INTEGER       NOT NULL,
    prompt              TEXT          NOT NULL,
    status              TEXT          NOT NULL,
    attempt             INTEGER       NOT NULL DEFAULT 0,
    lease_owner         TEXT,
    lease_expires_at    DATETIME,
    cancel_requested_at DATETIME,
    model_name          TEXT,
    result              TEXT,
    result_preview      TEXT,
    result_truncated    INTEGER       NOT NULL DEFAULT 0,
    error               TEXT,
    stop_reason         TEXT,
    token_usage         TEXT,
    started_at          DATETIME,
    completed_at        DATETIME,
    created_at          DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at          DATETIME      NOT NULL DEFAULT (datetime('now')),
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

-- =============================================================================
-- LangGraph Checkpointer 表 (由 LangGraph 运行时自动创建, 仅供参考)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- LG-1. checkpoints — 检查点元数据表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkpoints (
    thread_id            TEXT NOT NULL,
    checkpoint_ns        TEXT NOT NULL DEFAULT '',
    checkpoint_id        TEXT NOT NULL,
    parent_checkpoint_id TEXT,
    checkpoint           TEXT NOT NULL,
    metadata             TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

-- -----------------------------------------------------------------------------
-- LG-2. checkpoint_blobs — 检查点大字段表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkpoint_blobs (
    thread_id     TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    channel       TEXT NOT NULL,
    version       TEXT NOT NULL,
    type          TEXT NOT NULL,
    blob          BLOB NOT NULL,
    PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);

-- -----------------------------------------------------------------------------
-- LG-3. checkpoint_writes — 检查点写入队列表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkpoint_writes (
    thread_id     TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    channel       TEXT NOT NULL,
    version       TEXT NOT NULL,
    type          TEXT NOT NULL,
    blob          BLOB NOT NULL,
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, channel, version)
);

-- -----------------------------------------------------------------------------
-- LG-4. checkpoint_migrations — 检查点迁移版本表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkpoint_migrations (
    id      INTEGER NOT NULL,
    name    TEXT,
    applied DATETIME NOT NULL DEFAULT (datetime('now'))
);
