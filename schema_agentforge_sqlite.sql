-- =============================================================================
-- AgentForge 扩展数据库表结构 (SQLite)
-- 生成时间: 2026-10-08
-- 说明: 在 DeerFlow 现有 schema (schema_sqlite.sql) 基础上, 补充 AgentForge
--       改造所需的新建表与扩展表。
--       对应需求: 《AgentForge 改造需求与工作量评估》
--       对应架构: docs/deerflow-architecture-agentforge.html
--
-- 改造类型标记:
--   [新建]  从无到有
--   [扩展]  在现有表/能力上增强
-- =============================================================================

PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=30000;

-- =============================================================================
-- 一、Workflows 编排引擎 (需求 2.1 / 2.2 — 重中之重, 12 人天)
-- =============================================================================

-- W-1. workflows — 工作流定义主表 [新建]
CREATE TABLE IF NOT EXISTS workflows (
    id              TEXT          NOT NULL,
    name            TEXT          NOT NULL,
    description     TEXT          NOT NULL DEFAULT '',
    owner_user_id   TEXT          NOT NULL,
    team_id         TEXT,
    status          TEXT          NOT NULL DEFAULT 'draft',
    current_version INTEGER       NOT NULL DEFAULT 1,
    tags_json       TEXT          NOT NULL DEFAULT '[]',
    metadata_json   TEXT          NOT NULL DEFAULT '{}',
    created_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id),
    CONSTRAINT uq_workflows_owner_name UNIQUE (owner_user_id, name)
);
CREATE INDEX IF NOT EXISTS ix_workflows_owner_user_id ON workflows (owner_user_id);
CREATE INDEX IF NOT EXISTS ix_workflows_team_id ON workflows (team_id);
CREATE INDEX IF NOT EXISTS ix_workflows_status ON workflows (status);

-- W-2. workflow_versions — 工作流版本表 [新建]
CREATE TABLE IF NOT EXISTS workflow_versions (
    id              TEXT          NOT NULL,
    workflow_id     TEXT          NOT NULL,
    version         INTEGER       NOT NULL,
    name            TEXT,
    graph_json      TEXT          NOT NULL DEFAULT '{}',
    nodes_json      TEXT          NOT NULL DEFAULT '[]',
    edges_json      TEXT          NOT NULL DEFAULT '[]',
    config_json     TEXT          NOT NULL DEFAULT '{}',
    created_by      TEXT,
    created_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id),
    CONSTRAINT fk_wv_workflow FOREIGN KEY (workflow_id) REFERENCES workflows (id) ON DELETE CASCADE,
    CONSTRAINT uq_workflow_versions UNIQUE (workflow_id, version)
);
CREATE INDEX IF NOT EXISTS ix_workflow_versions_workflow_id ON workflow_versions (workflow_id);

-- W-3. workflow_nodes — 工作流节点表 [新建]
CREATE TABLE IF NOT EXISTS workflow_nodes (
    id              TEXT          NOT NULL,
    workflow_id     TEXT          NOT NULL,
    version_id      TEXT          NOT NULL,
    node_type       TEXT          NOT NULL,
    name            TEXT          NOT NULL,
    config_json     TEXT          NOT NULL DEFAULT '{}',
    position_json   TEXT          NOT NULL DEFAULT '{}',
    PRIMARY KEY (id),
    CONSTRAINT fk_wn_workflow FOREIGN KEY (workflow_id) REFERENCES workflows (id) ON DELETE CASCADE,
    CONSTRAINT fk_wn_version FOREIGN KEY (version_id) REFERENCES workflow_versions (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_workflow_nodes_workflow_id ON workflow_nodes (workflow_id);
CREATE INDEX IF NOT EXISTS ix_workflow_nodes_version_id ON workflow_nodes (version_id);

-- W-4. workflow_edges — 工作流边表 [新建]
CREATE TABLE IF NOT EXISTS workflow_edges (
    id              TEXT          NOT NULL,
    workflow_id     TEXT          NOT NULL,
    version_id      TEXT          NOT NULL,
    source_node_id  TEXT          NOT NULL,
    target_node_id  TEXT          NOT NULL,
    condition_json  TEXT          NOT NULL DEFAULT '{}',
    PRIMARY KEY (id),
    CONSTRAINT fk_we_workflow FOREIGN KEY (workflow_id) REFERENCES workflows (id) ON DELETE CASCADE,
    CONSTRAINT fk_we_version FOREIGN KEY (version_id) REFERENCES workflow_versions (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_workflow_edges_workflow_id ON workflow_edges (workflow_id);
CREATE INDEX IF NOT EXISTS ix_workflow_edges_version_id ON workflow_edges (version_id);

-- W-5. workflow_runs — 工作流运行记录表 [新建]
CREATE TABLE IF NOT EXISTS workflow_runs (
    id                TEXT          NOT NULL,
    workflow_id       TEXT          NOT NULL,
    version_id        TEXT          NOT NULL,
    thread_id         TEXT,
    run_id            TEXT,
    user_id           TEXT          NOT NULL,
    status            TEXT          NOT NULL DEFAULT 'pending',
    input_json        TEXT          NOT NULL DEFAULT '{}',
    output_json       TEXT,
    error             TEXT,
    current_step      INTEGER       NOT NULL DEFAULT 0,
    total_steps       INTEGER       NOT NULL DEFAULT 0,
    started_at        DATETIME,
    finished_at       DATETIME,
    created_at        DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at        DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id),
    CONSTRAINT fk_wr_workflow FOREIGN KEY (workflow_id) REFERENCES workflows (id) ON DELETE CASCADE,
    CONSTRAINT fk_wr_version FOREIGN KEY (version_id) REFERENCES workflow_versions (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_workflow_runs_workflow_id ON workflow_runs (workflow_id);
CREATE INDEX IF NOT EXISTS ix_workflow_runs_user_id ON workflow_runs (user_id);
CREATE INDEX IF NOT EXISTS ix_workflow_runs_status ON workflow_runs (status);
CREATE INDEX IF NOT EXISTS ix_workflow_runs_thread_id ON workflow_runs (thread_id);

-- W-6. workflow_run_steps — 工作流运行步骤表 (Debugger 用) [新建]
CREATE TABLE IF NOT EXISTS workflow_run_steps (
    id                TEXT          NOT NULL,
    workflow_run_id   TEXT          NOT NULL,
    node_id           TEXT          NOT NULL,
    node_name         TEXT          NOT NULL,
    step_index        INTEGER       NOT NULL,
    status            TEXT          NOT NULL DEFAULT 'pending',
    input_json        TEXT          NOT NULL DEFAULT '{}',
    output_json       TEXT,
    error             TEXT,
    started_at        DATETIME,
    finished_at       DATETIME,
    checkpoint_id     TEXT,
    PRIMARY KEY (id),
    CONSTRAINT fk_wrs_run FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs (id) ON DELETE CASCADE,
    CONSTRAINT uq_workflow_run_steps_seq UNIQUE (workflow_run_id, step_index)
);
CREATE INDEX IF NOT EXISTS ix_workflow_run_steps_run_id ON workflow_run_steps (workflow_run_id);
CREATE INDEX IF NOT EXISTS ix_workflow_run_steps_status ON workflow_run_steps (status);

-- =============================================================================
-- 二、Datasets 数据集 (需求 2.3 — 8 人天)
-- =============================================================================

-- D-1. datasets — 数据集主表 [新建]
CREATE TABLE IF NOT EXISTS datasets (
    id              TEXT          NOT NULL,
    name            TEXT          NOT NULL,
    description     TEXT          NOT NULL DEFAULT '',
    owner_user_id   TEXT          NOT NULL,
    team_id         TEXT,
    dataset_type    TEXT          NOT NULL DEFAULT 'general',
    format          TEXT          NOT NULL DEFAULT 'json',
    current_version INTEGER       NOT NULL DEFAULT 1,
    item_count      INTEGER       NOT NULL DEFAULT 0,
    tags_json       TEXT          NOT NULL DEFAULT '[]',
    metadata_json   TEXT          NOT NULL DEFAULT '{}',
    created_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id),
    CONSTRAINT uq_datasets_owner_name UNIQUE (owner_user_id, name)
);
CREATE INDEX IF NOT EXISTS ix_datasets_owner_user_id ON datasets (owner_user_id);
CREATE INDEX IF NOT EXISTS ix_datasets_team_id ON datasets (team_id);
CREATE INDEX IF NOT EXISTS ix_datasets_type ON datasets (dataset_type);

-- D-2. dataset_versions — 数据集版本表 [新建]
CREATE TABLE IF NOT EXISTS dataset_versions (
    id              TEXT          NOT NULL,
    dataset_id      TEXT          NOT NULL,
    version         INTEGER       NOT NULL,
    name            TEXT,
    item_count      INTEGER       NOT NULL DEFAULT 0,
    size_bytes      INTEGER       NOT NULL DEFAULT 0,
    checksum        TEXT,
    created_by      TEXT,
    created_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id),
    CONSTRAINT fk_dv_dataset FOREIGN KEY (dataset_id) REFERENCES datasets (id) ON DELETE CASCADE,
    CONSTRAINT uq_dataset_versions UNIQUE (dataset_id, version)
);
CREATE INDEX IF NOT EXISTS ix_dataset_versions_dataset_id ON dataset_versions (dataset_id);

-- D-3. dataset_files — 数据集文件表 [新建]
CREATE TABLE IF NOT EXISTS dataset_files (
    id              TEXT          NOT NULL,
    dataset_id      TEXT          NOT NULL,
    version_id      TEXT          NOT NULL,
    file_name       TEXT          NOT NULL,
    file_path       TEXT          NOT NULL,
    file_size       INTEGER       NOT NULL DEFAULT 0,
    mime_type       TEXT,
    checksum        TEXT,
    created_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id),
    CONSTRAINT fk_df_dataset FOREIGN KEY (dataset_id) REFERENCES datasets (id) ON DELETE CASCADE,
    CONSTRAINT fk_df_version FOREIGN KEY (version_id) REFERENCES dataset_versions (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_dataset_files_dataset_id ON dataset_files (dataset_id);
CREATE INDEX IF NOT EXISTS ix_dataset_files_version_id ON dataset_files (version_id);

-- D-4. dataset_items — 数据集条目表 [新建]
CREATE TABLE IF NOT EXISTS dataset_items (
    id              TEXT          NOT NULL,
    dataset_id      TEXT          NOT NULL,
    version_id      TEXT          NOT NULL,
    item_index      INTEGER       NOT NULL,
    content_json    TEXT          NOT NULL DEFAULT '{}',
    metadata_json   TEXT          NOT NULL DEFAULT '{}',
    created_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id),
    CONSTRAINT fk_di_dataset FOREIGN KEY (dataset_id) REFERENCES datasets (id) ON DELETE CASCADE,
    CONSTRAINT fk_di_version FOREIGN KEY (version_id) REFERENCES dataset_versions (id) ON DELETE CASCADE,
    CONSTRAINT uq_dataset_items_seq UNIQUE (dataset_id, version_id, item_index)
);
CREATE INDEX IF NOT EXISTS ix_dataset_items_dataset_id ON dataset_items (dataset_id);
CREATE INDEX IF NOT EXISTS ix_dataset_items_version_id ON dataset_items (version_id);

-- =============================================================================
-- 三、Vector Stores 向量库 (需求 2.4 — 6 人天, 可复用 memory 后端)
-- =============================================================================

-- V-1. vector_stores — 向量库主表 [新建]
CREATE TABLE IF NOT EXISTS vector_stores (
    id              TEXT          NOT NULL,
    name            TEXT          NOT NULL,
    description     TEXT          NOT NULL DEFAULT '',
    owner_user_id   TEXT          NOT NULL,
    team_id         TEXT,
    provider        TEXT          NOT NULL,
    embedding_model TEXT          NOT NULL,
    dimension       INTEGER       NOT NULL,
    status          TEXT          NOT NULL DEFAULT 'active',
    config_json     TEXT          NOT NULL DEFAULT '{}',
    created_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id),
    CONSTRAINT uq_vector_stores_owner_name UNIQUE (owner_user_id, name)
);
CREATE INDEX IF NOT EXISTS ix_vector_stores_owner_user_id ON vector_stores (owner_user_id);
CREATE INDEX IF NOT EXISTS ix_vector_stores_team_id ON vector_stores (team_id);
CREATE INDEX IF NOT EXISTS ix_vector_stores_provider ON vector_stores (provider);

-- V-2. vector_store_collections — 向量库集合表 [新建]
CREATE TABLE IF NOT EXISTS vector_store_collections (
    id              TEXT          NOT NULL,
    vector_store_id TEXT          NOT NULL,
    name            TEXT          NOT NULL,
    description     TEXT          NOT NULL DEFAULT '',
    document_count  INTEGER       NOT NULL DEFAULT 0,
    config_json     TEXT          NOT NULL DEFAULT '{}',
    created_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id),
    CONSTRAINT fk_vsc_store FOREIGN KEY (vector_store_id) REFERENCES vector_stores (id) ON DELETE CASCADE,
    CONSTRAINT uq_vector_store_collections UNIQUE (vector_store_id, name)
);
CREATE INDEX IF NOT EXISTS ix_vsc_store_id ON vector_store_collections (vector_store_id);

-- V-3. vector_store_documents — 向量库文档表 [新建]
CREATE TABLE IF NOT EXISTS vector_store_documents (
    id              TEXT          NOT NULL,
    collection_id   TEXT          NOT NULL,
    source          TEXT,
    content         TEXT          NOT NULL,
    content_hash    TEXT,
    metadata_json   TEXT          NOT NULL DEFAULT '{}',
    created_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id),
    CONSTRAINT fk_vsd_collection FOREIGN KEY (collection_id) REFERENCES vector_store_collections (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_vsd_collection_id ON vector_store_documents (collection_id);

-- =============================================================================
-- 四、Evaluations 评估体系 (需求 2.5 — 10 人天)
-- =============================================================================

-- E-1. evaluations — 评估定义表 [新建]
CREATE TABLE IF NOT EXISTS evaluations (
    id              TEXT          NOT NULL,
    name            TEXT          NOT NULL,
    description     TEXT          NOT NULL DEFAULT '',
    owner_user_id   TEXT          NOT NULL,
    team_id         TEXT,
    target_type     TEXT          NOT NULL,
    target_id       TEXT          NOT NULL,
    dataset_id      TEXT          NOT NULL,
    dataset_version INTEGER,
    metrics_json    TEXT          NOT NULL DEFAULT '[]',
    config_json     TEXT          NOT NULL DEFAULT '{}',
    status          TEXT          NOT NULL DEFAULT 'draft',
    created_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id),
    CONSTRAINT fk_eval_dataset FOREIGN KEY (dataset_id) REFERENCES datasets (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_evaluations_owner_user_id ON evaluations (owner_user_id);
CREATE INDEX IF NOT EXISTS ix_evaluations_team_id ON evaluations (team_id);
CREATE INDEX IF NOT EXISTS ix_evaluations_target ON evaluations (target_type, target_id);

-- E-2. evaluation_runs — 评估运行表 [新建]
CREATE TABLE IF NOT EXISTS evaluation_runs (
    id                TEXT          NOT NULL,
    evaluation_id     TEXT          NOT NULL,
    user_id           TEXT          NOT NULL,
    status            TEXT          NOT NULL DEFAULT 'pending',
    total_cases       INTEGER       NOT NULL DEFAULT 0,
    passed_cases      INTEGER       NOT NULL DEFAULT 0,
    failed_cases      INTEGER       NOT NULL DEFAULT 0,
    summary_json      TEXT,
    error             TEXT,
    started_at        DATETIME,
    finished_at       DATETIME,
    created_at        DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at        DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id),
    CONSTRAINT fk_er_evaluation FOREIGN KEY (evaluation_id) REFERENCES evaluations (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_evaluation_runs_evaluation_id ON evaluation_runs (evaluation_id);
CREATE INDEX IF NOT EXISTS ix_evaluation_runs_status ON evaluation_runs (status);

-- E-3. evaluation_cases — 评估用例表 [新建]
CREATE TABLE IF NOT EXISTS evaluation_cases (
    id              TEXT          NOT NULL,
    evaluation_id   TEXT          NOT NULL,
    dataset_item_id TEXT,
    input_json      TEXT          NOT NULL DEFAULT '{}',
    expected_json   TEXT,
    metrics_json    TEXT          NOT NULL DEFAULT '[]',
    PRIMARY KEY (id),
    CONSTRAINT fk_ec_evaluation FOREIGN KEY (evaluation_id) REFERENCES evaluations (id) ON DELETE CASCADE,
    CONSTRAINT fk_ec_dataset_item FOREIGN KEY (dataset_item_id) REFERENCES dataset_items (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_evaluation_cases_evaluation_id ON evaluation_cases (evaluation_id);

-- E-4. evaluation_results — 评估结果表 [新建]
CREATE TABLE IF NOT EXISTS evaluation_results (
    id                  TEXT          NOT NULL,
    evaluation_run_id   TEXT          NOT NULL,
    case_id             TEXT          NOT NULL,
    status              TEXT          NOT NULL,
    actual_json         TEXT,
    error               TEXT,
    score_json          TEXT,
    started_at          DATETIME,
    finished_at         DATETIME,
    PRIMARY KEY (id),
    CONSTRAINT fk_er_run FOREIGN KEY (evaluation_run_id) REFERENCES evaluation_runs (id) ON DELETE CASCADE,
    CONSTRAINT fk_er_case FOREIGN KEY (case_id) REFERENCES evaluation_cases (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_evaluation_results_run_id ON evaluation_results (evaluation_run_id);
CREATE INDEX IF NOT EXISTS ix_evaluation_results_status ON evaluation_results (status);

-- =============================================================================
-- 五、沙箱池化管理 (需求 2.7 — 扩展)
-- =============================================================================

-- S-1. sandbox_pools — 沙箱池表 [新建]
CREATE TABLE IF NOT EXISTS sandbox_pools (
    id              TEXT          NOT NULL,
    name            TEXT          NOT NULL,
    owner_user_id   TEXT          NOT NULL,
    team_id         TEXT,
    provider        TEXT          NOT NULL,
    pool_size       INTEGER       NOT NULL DEFAULT 1,
    min_idle        INTEGER       NOT NULL DEFAULT 0,
    status          TEXT          NOT NULL DEFAULT 'active',
    config_json     TEXT          NOT NULL DEFAULT '{}',
    created_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id),
    CONSTRAINT uq_sandbox_pools_owner_name UNIQUE (owner_user_id, name)
);
CREATE INDEX IF NOT EXISTS ix_sandbox_pools_owner_user_id ON sandbox_pools (owner_user_id);
CREATE INDEX IF NOT EXISTS ix_sandbox_pools_status ON sandbox_pools (status);

-- S-2. sandbox_instances — 沙箱实例表 [新建]
CREATE TABLE IF NOT EXISTS sandbox_instances (
    id              TEXT          NOT NULL,
    pool_id         TEXT          NOT NULL,
    instance_ref    TEXT          NOT NULL,
    status          TEXT          NOT NULL DEFAULT 'idle',
    health          TEXT          NOT NULL DEFAULT 'healthy',
    last_health_at  DATETIME,
    config_json     TEXT          NOT NULL DEFAULT '{}',
    created_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id),
    CONSTRAINT fk_si_pool FOREIGN KEY (pool_id) REFERENCES sandbox_pools (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_sandbox_instances_pool_id ON sandbox_instances (pool_id);
CREATE INDEX IF NOT EXISTS ix_sandbox_instances_status ON sandbox_instances (status);

-- S-3. sandbox_leases — 沙箱租约表 [新建]
CREATE TABLE IF NOT EXISTS sandbox_leases (
    id                TEXT          NOT NULL,
    instance_id       TEXT          NOT NULL,
    thread_id         TEXT,
    run_id            TEXT,
    user_id           TEXT,
    status            TEXT          NOT NULL DEFAULT 'active',
    leased_at         DATETIME      NOT NULL DEFAULT (datetime('now')),
    expires_at        DATETIME      NOT NULL,
    released_at       DATETIME,
    metadata_json     TEXT          NOT NULL DEFAULT '{}',
    PRIMARY KEY (id),
    CONSTRAINT fk_sl_instance FOREIGN KEY (instance_id) REFERENCES sandbox_instances (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_sandbox_leases_instance_id ON sandbox_leases (instance_id);
CREATE INDEX IF NOT EXISTS ix_sandbox_leases_thread_id ON sandbox_leases (thread_id);
CREATE INDEX IF NOT EXISTS ix_sandbox_leases_status ON sandbox_leases (status);

-- =============================================================================
-- 六、API Keys 管理 (需求 4.8 — 扩展)
-- =============================================================================

-- A-1. api_keys — API 密钥表 [新建]
CREATE TABLE IF NOT EXISTS api_keys (
    id              TEXT          NOT NULL,
    user_id         TEXT          NOT NULL,
    name            TEXT          NOT NULL,
    key_hash        TEXT          NOT NULL,
    key_prefix      TEXT          NOT NULL,
    scopes_json     TEXT          NOT NULL DEFAULT '[]',
    expires_at      DATETIME,
    last_used_at    DATETIME,
    use_count       INTEGER       NOT NULL DEFAULT 0,
    status          TEXT          NOT NULL DEFAULT 'active',
    created_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id),
    CONSTRAINT uq_api_keys_hash UNIQUE (key_hash)
);
CREATE INDEX IF NOT EXISTS ix_api_keys_user_id ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS ix_api_keys_status ON api_keys (status);
CREATE INDEX IF NOT EXISTS ix_api_keys_prefix ON api_keys (key_prefix);

-- =============================================================================
-- 七、Team 团队/权限 (需求 4.9 — 扩展)
-- =============================================================================

-- T-1. teams — 团队表 [新建]
CREATE TABLE IF NOT EXISTS teams (
    id              TEXT          NOT NULL,
    name            TEXT          NOT NULL,
    description     TEXT          NOT NULL DEFAULT '',
    owner_user_id   TEXT          NOT NULL,
    status          TEXT          NOT NULL DEFAULT 'active',
    metadata_json   TEXT          NOT NULL DEFAULT '{}',
    created_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    updated_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_teams_owner_user_id ON teams (owner_user_id);

-- T-2. team_members — 团队成员表 [新建]
CREATE TABLE IF NOT EXISTS team_members (
    id              TEXT          NOT NULL,
    team_id         TEXT          NOT NULL,
    user_id         TEXT          NOT NULL,
    role            TEXT          NOT NULL DEFAULT 'member',
    joined_at       DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id),
    CONSTRAINT fk_tm_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
    CONSTRAINT uq_team_members UNIQUE (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_team_members_team_id ON team_members (team_id);
CREATE INDEX IF NOT EXISTS ix_team_members_user_id ON team_members (user_id);

-- T-3. team_resource_permissions — 团队资源权限表 [新建]
CREATE TABLE IF NOT EXISTS team_resource_permissions (
    id              TEXT          NOT NULL,
    team_id         TEXT          NOT NULL,
    resource_type   TEXT          NOT NULL,
    resource_id     TEXT          NOT NULL,
    permission      TEXT          NOT NULL DEFAULT 'view',
    granted_by      TEXT,
    created_at      DATETIME      NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id),
    CONSTRAINT fk_trp_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
    CONSTRAINT uq_team_resource_permissions UNIQUE (team_id, resource_type, resource_id)
);
CREATE INDEX IF NOT EXISTS ix_trp_team_id ON team_resource_permissions (team_id);
CREATE INDEX IF NOT EXISTS ix_trp_resource ON team_resource_permissions (resource_type, resource_id);

-- =============================================================================
-- 八、现有表扩展 (需求 2.6 — Agent 资产元数据模型)
-- =============================================================================

-- agents 表扩展: 增加资产化元数据字段 [扩展]
-- SQLite 不支持 ADD COLUMN IF NOT EXISTS, 使用 ALTER TABLE 直接添加
ALTER TABLE agents ADD COLUMN description  TEXT          NOT NULL DEFAULT '';
ALTER TABLE agents ADD COLUMN status       TEXT          NOT NULL DEFAULT 'active';
ALTER TABLE agents ADD COLUMN tags_json    TEXT          NOT NULL DEFAULT '[]';
ALTER TABLE agents ADD COLUMN icon         TEXT;
ALTER TABLE agents ADD COLUMN team_id      TEXT;
ALTER TABLE agents ADD COLUMN run_count    INTEGER       NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN last_used_at DATETIME;

CREATE INDEX IF NOT EXISTS ix_agents_team_id ON agents (team_id);
CREATE INDEX IF NOT EXISTS ix_agents_status ON agents (status);
