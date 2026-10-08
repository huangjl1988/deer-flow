-- =============================================================================
-- AgentForge 扩展数据库表结构 (PostgreSQL)
-- 生成时间: 2026-10-08
-- 说明: 在 DeerFlow 现有 schema (schema_postgres.sql) 基础上, 补充 AgentForge
--       改造所需的新建表与扩展表。
--       对应需求: 《AgentForge 改造需求与工作量评估》
--       对应架构: docs/deerflow-architecture-agentforge.html
--
-- 改造类型标记:
--   [新建]  从无到有
--   [扩展]  在现有表/能力上增强
-- =============================================================================

-- =============================================================================
-- 一、Workflows 编排引擎 (需求 2.1 / 2.2 — 重中之重, 12 人天)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- W-1. workflows — 工作流定义主表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflows (
    id              VARCHAR(64)   NOT NULL,
    name            VARCHAR(128)  NOT NULL,
    description     TEXT          NOT NULL DEFAULT '',
    owner_user_id   VARCHAR(64)   NOT NULL,
    team_id         VARCHAR(64),
    status          VARCHAR(20)   NOT NULL DEFAULT 'draft',
    current_version INTEGER       NOT NULL DEFAULT 1,
    tags_json       JSON          NOT NULL DEFAULT '[]'::json,
    metadata_json   JSON          NOT NULL DEFAULT '{}'::json,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT uq_workflows_owner_name UNIQUE (owner_user_id, name)
);

CREATE INDEX IF NOT EXISTS ix_workflows_owner_user_id ON workflows (owner_user_id);
CREATE INDEX IF NOT EXISTS ix_workflows_team_id ON workflows (team_id);
CREATE INDEX IF NOT EXISTS ix_workflows_status ON workflows (status);

COMMENT ON TABLE workflows IS '工作流定义 (DAG 编排)';
COMMENT ON COLUMN workflows.status IS 'draft | published | archived';

-- -----------------------------------------------------------------------------
-- W-2. workflow_versions — 工作流版本表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_versions (
    id              VARCHAR(64)   NOT NULL,
    workflow_id     VARCHAR(64)   NOT NULL,
    version         INTEGER       NOT NULL,
    name            VARCHAR(128),
    graph_json      JSON          NOT NULL DEFAULT '{}'::json,
    nodes_json      JSON          NOT NULL DEFAULT '[]'::json,
    edges_json      JSON          NOT NULL DEFAULT '[]'::json,
    config_json     JSON          NOT NULL DEFAULT '{}'::json,
    created_by      VARCHAR(64),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_wv_workflow FOREIGN KEY (workflow_id) REFERENCES workflows (id) ON DELETE CASCADE,
    CONSTRAINT uq_workflow_versions UNIQUE (workflow_id, version)
);

CREATE INDEX IF NOT EXISTS ix_workflow_versions_workflow_id ON workflow_versions (workflow_id);

COMMENT ON TABLE workflow_versions IS '工作流版本化快照 (含 DAG 拓扑)';

-- -----------------------------------------------------------------------------
-- W-3. workflow_nodes — 工作流节点表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_nodes (
    id              VARCHAR(64)   NOT NULL,
    workflow_id     VARCHAR(64)   NOT NULL,
    version_id      VARCHAR(64)   NOT NULL,
    node_type       VARCHAR(32)   NOT NULL,
    name            VARCHAR(128)  NOT NULL,
    config_json     JSON          NOT NULL DEFAULT '{}'::json,
    position_json   JSON          NOT NULL DEFAULT '{}'::json,
    PRIMARY KEY (id),
    CONSTRAINT fk_wn_workflow FOREIGN KEY (workflow_id) REFERENCES workflows (id) ON DELETE CASCADE,
    CONSTRAINT fk_wn_version FOREIGN KEY (version_id) REFERENCES workflow_versions (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_workflow_nodes_workflow_id ON workflow_nodes (workflow_id);
CREATE INDEX IF NOT EXISTS ix_workflow_nodes_version_id ON workflow_nodes (version_id);

COMMENT ON TABLE workflow_nodes IS '工作流节点 (agent | tool | condition | input | output)';

-- -----------------------------------------------------------------------------
-- W-4. workflow_edges — 工作流边表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_edges (
    id              VARCHAR(64)   NOT NULL,
    workflow_id     VARCHAR(64)   NOT NULL,
    version_id      VARCHAR(64)   NOT NULL,
    source_node_id  VARCHAR(64)   NOT NULL,
    target_node_id  VARCHAR(64)   NOT NULL,
    condition_json  JSON          NOT NULL DEFAULT '{}'::json,
    PRIMARY KEY (id),
    CONSTRAINT fk_we_workflow FOREIGN KEY (workflow_id) REFERENCES workflows (id) ON DELETE CASCADE,
    CONSTRAINT fk_we_version FOREIGN KEY (version_id) REFERENCES workflow_versions (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_workflow_edges_workflow_id ON workflow_edges (workflow_id);
CREATE INDEX IF NOT EXISTS ix_workflow_edges_version_id ON workflow_edges (version_id);

COMMENT ON TABLE workflow_edges IS '工作流边 (节点依赖关系)';

-- -----------------------------------------------------------------------------
-- W-5. workflow_runs — 工作流运行记录表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_runs (
    id                VARCHAR(64)   NOT NULL,
    workflow_id       VARCHAR(64)   NOT NULL,
    version_id        VARCHAR(64)   NOT NULL,
    thread_id         VARCHAR(64),
    run_id            VARCHAR(64),
    user_id           VARCHAR(64)   NOT NULL,
    status            VARCHAR(20)   NOT NULL DEFAULT 'pending',
    input_json        JSON          NOT NULL DEFAULT '{}'::json,
    output_json       JSON,
    error             TEXT,
    current_step      INTEGER       NOT NULL DEFAULT 0,
    total_steps       INTEGER       NOT NULL DEFAULT 0,
    started_at        TIMESTAMPTZ,
    finished_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_wr_workflow FOREIGN KEY (workflow_id) REFERENCES workflows (id) ON DELETE CASCADE,
    CONSTRAINT fk_wr_version FOREIGN KEY (version_id) REFERENCES workflow_versions (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_workflow_runs_workflow_id ON workflow_runs (workflow_id);
CREATE INDEX IF NOT EXISTS ix_workflow_runs_user_id ON workflow_runs (user_id);
CREATE INDEX IF NOT EXISTS ix_workflow_runs_status ON workflow_runs (status);
CREATE INDEX IF NOT EXISTS ix_workflow_runs_thread_id ON workflow_runs (thread_id);

COMMENT ON TABLE workflow_runs IS '工作流运行记录 (复用 LangGraph checkpoint)';
COMMENT ON COLUMN workflow_runs.status IS 'pending | running | success | error | cancelled | paused';

-- -----------------------------------------------------------------------------
-- W-6. workflow_run_steps — 工作流运行步骤表 (Debugger 用) [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_run_steps (
    id                VARCHAR(64)   NOT NULL,
    workflow_run_id   VARCHAR(64)   NOT NULL,
    node_id           VARCHAR(64)   NOT NULL,
    node_name         VARCHAR(128)  NOT NULL,
    step_index        INTEGER       NOT NULL,
    status            VARCHAR(20)   NOT NULL DEFAULT 'pending',
    input_json        JSON          NOT NULL DEFAULT '{}'::json,
    output_json       JSON,
    error             TEXT,
    started_at        TIMESTAMPTZ,
    finished_at       TIMESTAMPTZ,
    checkpoint_id     VARCHAR(255),
    PRIMARY KEY (id),
    CONSTRAINT fk_wrs_run FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs (id) ON DELETE CASCADE,
    CONSTRAINT uq_workflow_run_steps_seq UNIQUE (workflow_run_id, step_index)
);

CREATE INDEX IF NOT EXISTS ix_workflow_run_steps_run_id ON workflow_run_steps (workflow_run_id);
CREATE INDEX IF NOT EXISTS ix_workflow_run_steps_status ON workflow_run_steps (status);

COMMENT ON TABLE workflow_run_steps IS '工作流运行的单个节点步骤 (Debugger 单步/断点)';
COMMENT ON COLUMN workflow_run_steps.checkpoint_id IS '对应的 LangGraph checkpoint_id, 用于回放';

-- =============================================================================
-- 二、Datasets 数据集 (需求 2.3 — 8 人天)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- D-1. datasets — 数据集主表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS datasets (
    id              VARCHAR(64)   NOT NULL,
    name            VARCHAR(128)  NOT NULL,
    description     TEXT          NOT NULL DEFAULT '',
    owner_user_id   VARCHAR(64)   NOT NULL,
    team_id         VARCHAR(64),
    dataset_type    VARCHAR(32)   NOT NULL DEFAULT 'general',
    format          VARCHAR(32)   NOT NULL DEFAULT 'json',
    current_version INTEGER       NOT NULL DEFAULT 1,
    item_count      INTEGER       NOT NULL DEFAULT 0,
    tags_json       JSON          NOT NULL DEFAULT '[]'::json,
    metadata_json   JSON          NOT NULL DEFAULT '{}'::json,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT uq_datasets_owner_name UNIQUE (owner_user_id, name)
);

CREATE INDEX IF NOT EXISTS ix_datasets_owner_user_id ON datasets (owner_user_id);
CREATE INDEX IF NOT EXISTS ix_datasets_team_id ON datasets (team_id);
CREATE INDEX IF NOT EXISTS ix_datasets_type ON datasets (dataset_type);

COMMENT ON TABLE datasets IS '平台级数据集资产';
COMMENT ON COLUMN datasets.dataset_type IS 'general | training | evaluation | knowledge';
COMMENT ON COLUMN datasets.format IS 'json | jsonl | csv | parquet';

-- -----------------------------------------------------------------------------
-- D-2. dataset_versions — 数据集版本表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dataset_versions (
    id              VARCHAR(64)   NOT NULL,
    dataset_id      VARCHAR(64)   NOT NULL,
    version         INTEGER       NOT NULL,
    name            VARCHAR(128),
    item_count      INTEGER       NOT NULL DEFAULT 0,
    size_bytes      BIGINT        NOT NULL DEFAULT 0,
    checksum        VARCHAR(128),
    created_by      VARCHAR(64),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_dv_dataset FOREIGN KEY (dataset_id) REFERENCES datasets (id) ON DELETE CASCADE,
    CONSTRAINT uq_dataset_versions UNIQUE (dataset_id, version)
);

CREATE INDEX IF NOT EXISTS ix_dataset_versions_dataset_id ON dataset_versions (dataset_id);

COMMENT ON TABLE dataset_versions IS '数据集版本快照';

-- -----------------------------------------------------------------------------
-- D-3. dataset_files — 数据集文件表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dataset_files (
    id              VARCHAR(64)   NOT NULL,
    dataset_id      VARCHAR(64)   NOT NULL,
    version_id      VARCHAR(64)   NOT NULL,
    file_name       VARCHAR(255)  NOT NULL,
    file_path       TEXT          NOT NULL,
    file_size       BIGINT        NOT NULL DEFAULT 0,
    mime_type       VARCHAR(128),
    checksum        VARCHAR(128),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_df_dataset FOREIGN KEY (dataset_id) REFERENCES datasets (id) ON DELETE CASCADE,
    CONSTRAINT fk_df_version FOREIGN KEY (version_id) REFERENCES dataset_versions (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_dataset_files_dataset_id ON dataset_files (dataset_id);
CREATE INDEX IF NOT EXISTS ix_dataset_files_version_id ON dataset_files (version_id);

COMMENT ON TABLE dataset_files IS '数据集关联的原始文件';

-- -----------------------------------------------------------------------------
-- D-4. dataset_items — 数据集条目表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dataset_items (
    id              VARCHAR(64)   NOT NULL,
    dataset_id      VARCHAR(64)   NOT NULL,
    version_id      VARCHAR(64)   NOT NULL,
    item_index      INTEGER       NOT NULL,
    content_json    JSON          NOT NULL DEFAULT '{}'::json,
    metadata_json   JSON          NOT NULL DEFAULT '{}'::json,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_di_dataset FOREIGN KEY (dataset_id) REFERENCES datasets (id) ON DELETE CASCADE,
    CONSTRAINT fk_di_version FOREIGN KEY (version_id) REFERENCES dataset_versions (id) ON DELETE CASCADE,
    CONSTRAINT uq_dataset_items_seq UNIQUE (dataset_id, version_id, item_index)
);

CREATE INDEX IF NOT EXISTS ix_dataset_items_dataset_id ON dataset_items (dataset_id);
CREATE INDEX IF NOT EXISTS ix_dataset_items_version_id ON dataset_items (version_id);

COMMENT ON TABLE dataset_items IS '数据集的单条记录 (行)';

-- =============================================================================
-- 三、Vector Stores 向量库 (需求 2.4 — 6 人天, 可复用 memory 后端)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- V-1. vector_stores — 向量库主表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vector_stores (
    id              VARCHAR(64)   NOT NULL,
    name            VARCHAR(128)  NOT NULL,
    description     TEXT          NOT NULL DEFAULT '',
    owner_user_id   VARCHAR(64)   NOT NULL,
    team_id         VARCHAR(64),
    provider        VARCHAR(32)   NOT NULL,
    embedding_model VARCHAR(128)  NOT NULL,
    dimension       INTEGER       NOT NULL,
    status          VARCHAR(20)   NOT NULL DEFAULT 'active',
    config_json     JSON          NOT NULL DEFAULT '{}'::json,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT uq_vector_stores_owner_name UNIQUE (owner_user_id, name)
);

CREATE INDEX IF NOT EXISTS ix_vector_stores_owner_user_id ON vector_stores (owner_user_id);
CREATE INDEX IF NOT EXISTS ix_vector_stores_team_id ON vector_stores (team_id);
CREATE INDEX IF NOT EXISTS ix_vector_stores_provider ON vector_stores (provider);

COMMENT ON TABLE vector_stores IS '向量库定义';
COMMENT ON COLUMN vector_stores.provider IS 'pgvector | chroma | qdrant | pinecone | weaviate | memory(复用)';

-- -----------------------------------------------------------------------------
-- V-2. vector_store_collections — 向量库集合表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vector_store_collections (
    id              VARCHAR(64)   NOT NULL,
    vector_store_id VARCHAR(64)   NOT NULL,
    name            VARCHAR(128)  NOT NULL,
    description     TEXT          NOT NULL DEFAULT '',
    document_count  INTEGER       NOT NULL DEFAULT 0,
    config_json     JSON          NOT NULL DEFAULT '{}'::json,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_vsc_store FOREIGN KEY (vector_store_id) REFERENCES vector_stores (id) ON DELETE CASCADE,
    CONSTRAINT uq_vector_store_collections UNIQUE (vector_store_id, name)
);

CREATE INDEX IF NOT EXISTS ix_vsc_store_id ON vector_store_collections (vector_store_id);

COMMENT ON TABLE vector_store_collections IS '向量库中的集合 (命名空间)';

-- -----------------------------------------------------------------------------
-- V-3. vector_store_documents — 向量库文档表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vector_store_documents (
    id              VARCHAR(64)   NOT NULL,
    collection_id   VARCHAR(64)   NOT NULL,
    source          VARCHAR(255),
    content         TEXT          NOT NULL,
    content_hash    VARCHAR(128),
    metadata_json   JSON          NOT NULL DEFAULT '{}'::json,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_vsd_collection FOREIGN KEY (collection_id) REFERENCES vector_store_collections (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_vsd_collection_id ON vector_store_documents (collection_id);

COMMENT ON TABLE vector_store_documents IS '向量库中文档 (向量实际存储由 provider 管理)';

-- =============================================================================
-- 四、Evaluations 评估体系 (需求 2.5 — 10 人天)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- E-1. evaluations — 评估定义表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluations (
    id              VARCHAR(64)   NOT NULL,
    name            VARCHAR(128)  NOT NULL,
    description     TEXT          NOT NULL DEFAULT '',
    owner_user_id   VARCHAR(64)   NOT NULL,
    team_id         VARCHAR(64),
    target_type     VARCHAR(32)   NOT NULL,
    target_id       VARCHAR(64)   NOT NULL,
    dataset_id      VARCHAR(64)   NOT NULL,
    dataset_version INTEGER,
    metrics_json    JSON          NOT NULL DEFAULT '[]'::json,
    config_json     JSON          NOT NULL DEFAULT '{}'::json,
    status          VARCHAR(20)   NOT NULL DEFAULT 'draft',
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_eval_dataset FOREIGN KEY (dataset_id) REFERENCES datasets (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_evaluations_owner_user_id ON evaluations (owner_user_id);
CREATE INDEX IF NOT EXISTS ix_evaluations_team_id ON evaluations (team_id);
CREATE INDEX IF NOT EXISTS ix_evaluations_target ON evaluations (target_type, target_id);

COMMENT ON TABLE evaluations IS '评估定义 (绑定目标 agent/workflow + 数据集)';
COMMENT ON COLUMN evaluations.target_type IS 'agent | workflow';

-- -----------------------------------------------------------------------------
-- E-2. evaluation_runs — 评估运行表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluation_runs (
    id                VARCHAR(64)   NOT NULL,
    evaluation_id     VARCHAR(64)   NOT NULL,
    user_id           VARCHAR(64)   NOT NULL,
    status            VARCHAR(20)   NOT NULL DEFAULT 'pending',
    total_cases       INTEGER       NOT NULL DEFAULT 0,
    passed_cases      INTEGER       NOT NULL DEFAULT 0,
    failed_cases      INTEGER       NOT NULL DEFAULT 0,
    summary_json      JSON,
    error             TEXT,
    started_at        TIMESTAMPTZ,
    finished_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_er_evaluation FOREIGN KEY (evaluation_id) REFERENCES evaluations (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_evaluation_runs_evaluation_id ON evaluation_runs (evaluation_id);
CREATE INDEX IF NOT EXISTS ix_evaluation_runs_status ON evaluation_runs (status);

COMMENT ON TABLE evaluation_runs IS '单次评估跑分记录';

-- -----------------------------------------------------------------------------
-- E-3. evaluation_cases — 评估用例表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluation_cases (
    id              VARCHAR(64)   NOT NULL,
    evaluation_id   VARCHAR(64)   NOT NULL,
    dataset_item_id VARCHAR(64),
    input_json      JSON          NOT NULL DEFAULT '{}'::json,
    expected_json   JSON,
    metrics_json    JSON          NOT NULL DEFAULT '[]'::json,
    PRIMARY KEY (id),
    CONSTRAINT fk_ec_evaluation FOREIGN KEY (evaluation_id) REFERENCES evaluations (id) ON DELETE CASCADE,
    CONSTRAINT fk_ec_dataset_item FOREIGN KEY (dataset_item_id) REFERENCES dataset_items (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_evaluation_cases_evaluation_id ON evaluation_cases (evaluation_id);

COMMENT ON TABLE evaluation_cases IS '评估用例 (来自数据集条目)';

-- -----------------------------------------------------------------------------
-- E-4. evaluation_results — 评估结果表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluation_results (
    id                  VARCHAR(64)   NOT NULL,
    evaluation_run_id   VARCHAR(64)   NOT NULL,
    case_id             VARCHAR(64)   NOT NULL,
    status              VARCHAR(20)   NOT NULL,
    actual_json         JSON,
    error               TEXT,
    score_json          JSON,
    started_at          TIMESTAMPTZ,
    finished_at         TIMESTAMPTZ,
    PRIMARY KEY (id),
    CONSTRAINT fk_er_run FOREIGN KEY (evaluation_run_id) REFERENCES evaluation_runs (id) ON DELETE CASCADE,
    CONSTRAINT fk_er_case FOREIGN KEY (case_id) REFERENCES evaluation_cases (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_evaluation_results_run_id ON evaluation_results (evaluation_run_id);
CREATE INDEX IF NOT EXISTS ix_evaluation_results_status ON evaluation_results (status);

COMMENT ON TABLE evaluation_results IS '单个评估用例的执行结果';

-- =============================================================================
-- 五、沙箱池化管理 (需求 2.7 — 扩展)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- S-1. sandbox_pools — 沙箱池表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sandbox_pools (
    id              VARCHAR(64)   NOT NULL,
    name            VARCHAR(128)  NOT NULL,
    owner_user_id   VARCHAR(64)   NOT NULL,
    team_id         VARCHAR(64),
    provider        VARCHAR(32)   NOT NULL,
    pool_size       INTEGER       NOT NULL DEFAULT 1,
    min_idle        INTEGER       NOT NULL DEFAULT 0,
    status          VARCHAR(20)   NOT NULL DEFAULT 'active',
    config_json     JSON          NOT NULL DEFAULT '{}'::json,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT uq_sandbox_pools_owner_name UNIQUE (owner_user_id, name)
);

CREATE INDEX IF NOT EXISTS ix_sandbox_pools_owner_user_id ON sandbox_pools (owner_user_id);
CREATE INDEX IF NOT EXISTS ix_sandbox_pools_status ON sandbox_pools (status);

COMMENT ON TABLE sandbox_pools IS '沙箱池定义';
COMMENT ON COLUMN sandbox_pools.provider IS 'local | aio | opensandbox | e2b | boxlite';

-- -----------------------------------------------------------------------------
-- S-2. sandbox_instances — 沙箱实例表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sandbox_instances (
    id              VARCHAR(64)   NOT NULL,
    pool_id         VARCHAR(64)   NOT NULL,
    instance_ref    VARCHAR(255)  NOT NULL,
    status          VARCHAR(20)   NOT NULL DEFAULT 'idle',
    health          VARCHAR(20)   NOT NULL DEFAULT 'healthy',
    last_health_at  TIMESTAMPTZ,
    config_json     JSON          NOT NULL DEFAULT '{}'::json,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_si_pool FOREIGN KEY (pool_id) REFERENCES sandbox_pools (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_sandbox_instances_pool_id ON sandbox_instances (pool_id);
CREATE INDEX IF NOT EXISTS ix_sandbox_instances_status ON sandbox_instances (status);

COMMENT ON TABLE sandbox_instances IS '沙箱池中的实例';
COMMENT ON COLUMN sandbox_instances.status IS 'idle | busy | starting | stopping | terminated';
COMMENT ON COLUMN sandbox_instances.health IS 'healthy | degraded | unhealthy';

-- -----------------------------------------------------------------------------
-- S-3. sandbox_leases — 沙箱租约表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sandbox_leases (
    id                VARCHAR(64)   NOT NULL,
    instance_id       VARCHAR(64)   NOT NULL,
    thread_id         VARCHAR(64),
    run_id            VARCHAR(64),
    user_id           VARCHAR(64),
    status            VARCHAR(20)   NOT NULL DEFAULT 'active',
    leased_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ   NOT NULL,
    released_at       TIMESTAMPTZ,
    metadata_json     JSON          NOT NULL DEFAULT '{}'::json,
    PRIMARY KEY (id),
    CONSTRAINT fk_sl_instance FOREIGN KEY (instance_id) REFERENCES sandbox_instances (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_sandbox_leases_instance_id ON sandbox_leases (instance_id);
CREATE INDEX IF NOT EXISTS ix_sandbox_leases_thread_id ON sandbox_leases (thread_id);
CREATE INDEX IF NOT EXISTS ix_sandbox_leases_status ON sandbox_leases (status);

COMMENT ON TABLE sandbox_leases IS '沙箱实例的租约 (占用/隔离)';

-- =============================================================================
-- 六、API Keys 管理 (需求 4.8 — 扩展)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A-1. api_keys — API 密钥表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
    id              VARCHAR(64)   NOT NULL,
    user_id         VARCHAR(64)   NOT NULL,
    name            VARCHAR(128)  NOT NULL,
    key_hash        VARCHAR(255)  NOT NULL,
    key_prefix      VARCHAR(16)   NOT NULL,
    scopes_json     JSON          NOT NULL DEFAULT '[]'::json,
    expires_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ,
    use_count       INTEGER       NOT NULL DEFAULT 0,
    status          VARCHAR(20)   NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT uq_api_keys_hash UNIQUE (key_hash)
);

CREATE INDEX IF NOT EXISTS ix_api_keys_user_id ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS ix_api_keys_status ON api_keys (status);
CREATE INDEX IF NOT EXISTS ix_api_keys_prefix ON api_keys (key_prefix);

COMMENT ON TABLE api_keys IS '用户 API 密钥';
COMMENT ON COLUMN api_keys.status IS 'active | revoked | expired';

-- =============================================================================
-- 七、Team 团队/权限 (需求 4.9 — 扩展)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- T-1. teams — 团队表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teams (
    id              VARCHAR(64)   NOT NULL,
    name            VARCHAR(128)  NOT NULL,
    description     TEXT          NOT NULL DEFAULT '',
    owner_user_id   VARCHAR(64)   NOT NULL,
    status          VARCHAR(20)   NOT NULL DEFAULT 'active',
    metadata_json   JSON          NOT NULL DEFAULT '{}'::json,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_teams_owner_user_id ON teams (owner_user_id);

COMMENT ON TABLE teams IS '团队/工作空间';

-- -----------------------------------------------------------------------------
-- T-2. team_members — 团队成员表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_members (
    id              VARCHAR(64)   NOT NULL,
    team_id         VARCHAR(64)   NOT NULL,
    user_id         VARCHAR(64)   NOT NULL,
    role            VARCHAR(20)   NOT NULL DEFAULT 'member',
    joined_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_tm_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
    CONSTRAINT uq_team_members UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_team_members_team_id ON team_members (team_id);
CREATE INDEX IF NOT EXISTS ix_team_members_user_id ON team_members (user_id);

COMMENT ON TABLE team_members IS '团队成员关系';
COMMENT ON COLUMN team_members.role IS 'owner | admin | member | viewer';

-- -----------------------------------------------------------------------------
-- T-3. team_resource_permissions — 团队资源权限表 [新建]
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_resource_permissions (
    id              VARCHAR(64)   NOT NULL,
    team_id         VARCHAR(64)   NOT NULL,
    resource_type   VARCHAR(32)   NOT NULL,
    resource_id     VARCHAR(64)   NOT NULL,
    permission      VARCHAR(20)   NOT NULL DEFAULT 'view',
    granted_by      VARCHAR(64),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_trp_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
    CONSTRAINT uq_team_resource_permissions UNIQUE (team_id, resource_type, resource_id)
);

CREATE INDEX IF NOT EXISTS ix_trp_team_id ON team_resource_permissions (team_id);
CREATE INDEX IF NOT EXISTS ix_trp_resource ON team_resource_permissions (resource_type, resource_id);

COMMENT ON TABLE team_resource_permissions IS '团队对资源 (agent/workflow/dataset/...) 的访问权限';
COMMENT ON COLUMN team_resource_permissions.resource_type IS 'agent | workflow | dataset | vector_store | evaluation';
COMMENT ON COLUMN team_resource_permissions.permission IS 'view | edit | admin';

-- =============================================================================
-- 八、现有表扩展 (需求 2.6 — Agent 资产元数据模型)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- agents 表扩展: 增加资产化元数据字段 [扩展]
-- -----------------------------------------------------------------------------
ALTER TABLE agents ADD COLUMN IF NOT EXISTS description  TEXT          NOT NULL DEFAULT '';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS status       VARCHAR(20)   NOT NULL DEFAULT 'active';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS tags_json    JSON          NOT NULL DEFAULT '[]'::json;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS icon         VARCHAR(64);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS team_id      VARCHAR(64);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS run_count    INTEGER       NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_agents_team_id ON agents (team_id);
CREATE INDEX IF NOT EXISTS ix_agents_status ON agents (status);

COMMENT ON COLUMN agents.description IS 'Agent 描述 (资产化展示)';
COMMENT ON COLUMN agents.status IS 'active | archived | deleted';
COMMENT ON COLUMN agents.tags_json IS '标签数组';
COMMENT ON COLUMN agents.icon IS '图标标识';
COMMENT ON COLUMN agents.run_count IS '累计运行次数 (统计)';
COMMENT ON COLUMN agents.last_used_at IS '最近使用时间';
