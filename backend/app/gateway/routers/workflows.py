"""Workflows API — DAG orchestration CRUD and run history.

Provides endpoints to list, create, retrieve, update, and delete workflows,
plus listing workflow runs (execution history).
"""

from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.gateway.authz import require_permission
from app.gateway.deps import get_current_user
from deerflow.persistence.engine import get_session_factory
from deerflow.persistence.workflows.model import (
    WorkflowEdgeRow,
    WorkflowNodeRow,
    WorkflowRow,
    WorkflowRunRow,
    WorkflowRunStepRow,
    WorkflowVersionRow,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/workflows", tags=["workflows"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class WorkflowSummary(BaseModel):
    """Workflow list item."""

    id: str
    name: str
    description: str = ""
    status: str
    current_version: int = 1
    team_id: str | None = None
    tags: list = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class WorkflowDetail(WorkflowSummary):
    """Full workflow detail."""

    owner_user_id: str
    metadata: dict = Field(default_factory=dict)


class WorkflowRunSummary(BaseModel):
    """Workflow run list item."""

    id: str
    workflow_id: str
    status: str
    current_step: int = 0
    total_steps: int = 0
    run_id: str | None = None
    thread_id: str | None = None
    error: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime


class WorkflowStatsResponse(BaseModel):
    """Headline counters for the workflows dashboard."""

    total_workflows: int
    active_workflows: int
    draft_workflows: int
    archived_workflows: int
    total_runs: int


class WorkflowCreateRequest(BaseModel):
    """Request body for creating a workflow."""

    name: str = Field(..., min_length=1, max_length=128)
    description: str = ""
    team_id: str | None = None
    tags: list = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


class WorkflowUpdateRequest(BaseModel):
    """Request body for updating a workflow."""

    name: str | None = Field(default=None, max_length=128)
    description: str | None = None
    status: str | None = Field(default=None, description="draft | published | archived")
    tags: list | None = None
    metadata: dict | None = None


class WorkflowVersionSummary(BaseModel):
    """Workflow version list item."""

    id: str
    workflow_id: str
    version: int
    name: str | None = None
    created_by: str | None = None
    created_at: datetime


class WorkflowVersionDetail(WorkflowVersionSummary):
    """Full version detail with graph topology."""

    graph: dict = Field(default_factory=dict)
    nodes: list = Field(default_factory=list)
    edges: list = Field(default_factory=list)
    config: dict = Field(default_factory=dict)


class WorkflowNodeSummary(BaseModel):
    """Workflow node item."""

    id: str
    workflow_id: str
    version_id: str
    node_type: str
    name: str
    config: dict = Field(default_factory=dict)
    position: dict = Field(default_factory=dict)


class WorkflowEdgeSummary(BaseModel):
    """Workflow edge item."""

    id: str
    workflow_id: str
    version_id: str
    source_node_id: str
    target_node_id: str
    condition: dict = Field(default_factory=dict)


class WorkflowRunStepSummary(BaseModel):
    """A single step within a workflow run (for debugger)."""

    id: str
    workflow_run_id: str
    node_id: str
    node_name: str
    step_index: int
    status: str
    input: dict = Field(default_factory=dict)
    output: dict | None = None
    error: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    checkpoint_id: str | None = None


class WorkflowVersionCreateRequest(BaseModel):
    """Request body for saving a workflow version (editor save)."""

    name: str | None = Field(default=None, max_length=128)
    graph: dict = Field(default_factory=dict)
    nodes: list = Field(default_factory=list)
    edges: list = Field(default_factory=list)
    config: dict = Field(default_factory=dict)


class WorkflowNodeCreateRequest(BaseModel):
    """Request body for creating/updating a node."""

    node_type: str = Field(..., description="agent | tool | condition | input | output")
    name: str = Field(..., min_length=1, max_length=128)
    config: dict = Field(default_factory=dict)
    position: dict = Field(default_factory=dict)


class WorkflowEdgeCreateRequest(BaseModel):
    """Request body for creating an edge."""

    source_node_id: str = Field(..., min_length=1)
    target_node_id: str = Field(..., min_length=1)
    condition: dict = Field(default_factory=dict)


class WorkflowRunTriggerRequest(BaseModel):
    """Request body for triggering a workflow run."""

    input_data: dict = Field(default_factory=dict, description="Input data for the workflow run")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _session_factory_or_503():
    sf = get_session_factory()
    if sf is None:
        raise HTTPException(
            status_code=503,
            detail="Workflows API requires a SQL database backend; set database.backend to sqlite or postgres in config.yaml.",
        )
    return sf


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


def _generate_id() -> str:
    return f"wf_{secrets.token_hex(12)}"


def _generate_version_id() -> str:
    return f"wfv_{secrets.token_hex(12)}"


def _generate_node_id() -> str:
    return f"wn_{secrets.token_hex(12)}"


def _generate_edge_id() -> str:
    return f"we_{secrets.token_hex(12)}"


def _generate_run_id() -> str:
    return f"wfr_{secrets.token_hex(12)}"


def _generate_step_id() -> str:
    return f"wrs_{secrets.token_hex(12)}"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/stats",
    response_model=WorkflowStatsResponse,
    summary="Workflow Stats",
    description="Headline counters for workflows and runs.",
)
@require_permission("threads", "read")
async def workflow_stats(request: Request) -> WorkflowStatsResponse:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        base = select(WorkflowRow)
        if user_id:
            base = base.where(WorkflowRow.owner_user_id == user_id)

        total = (await session.scalar(select(func.count()).select_from(base.subquery()))) or 0
        active = (await session.scalar(select(func.count()).select_from(base.where(WorkflowRow.status == "published").subquery()))) or 0
        draft = (await session.scalar(select(func.count()).select_from(base.where(WorkflowRow.status == "draft").subquery()))) or 0
        archived = (await session.scalar(select(func.count()).select_from(base.where(WorkflowRow.status == "archived").subquery()))) or 0

        run_base = select(WorkflowRunRow)
        if user_id:
            run_base = run_base.where(WorkflowRunRow.user_id == user_id)
        total_runs = (await session.scalar(select(func.count()).select_from(run_base.subquery()))) or 0

    return WorkflowStatsResponse(
        total_workflows=total,
        active_workflows=active,
        draft_workflows=draft,
        archived_workflows=archived,
        total_runs=total_runs,
    )


@router.get(
    "",
    response_model=list[WorkflowSummary],
    summary="List Workflows",
    description="List workflows for the current user, newest first.",
)
@require_permission("threads", "read")
async def list_workflows(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None, description="Filter by status (draft, published, archived)"),
) -> list[WorkflowSummary]:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    stmt = select(WorkflowRow).order_by(WorkflowRow.created_at.desc()).limit(limit).offset(offset)
    if user_id:
        stmt = stmt.where(WorkflowRow.owner_user_id == user_id)
    if status:
        stmt = stmt.where(WorkflowRow.status == status)

    async with sf() as session:
        rows = (await session.execute(stmt)).scalars().all()

    return [
        WorkflowSummary(
            id=r.id,
            name=r.name,
            description=r.description,
            status=r.status,
            current_version=r.current_version,
            team_id=r.team_id,
            tags=r.tags_json if isinstance(r.tags_json, list) else [],
            created_at=_as_utc(r.created_at) or datetime.now(UTC),
            updated_at=_as_utc(r.updated_at) or datetime.now(UTC),
        )
        for r in rows
    ]


@router.get(
    "/{workflow_id}",
    response_model=WorkflowDetail,
    summary="Get Workflow",
    description="Retrieve a single workflow by ID.",
)
@require_permission("threads", "read")
async def get_workflow(workflow_id: str, request: Request) -> WorkflowDetail:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        row = await session.get(WorkflowRow, workflow_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Workflow not found")
        if user_id and row.owner_user_id != user_id:
            raise HTTPException(status_code=404, detail="Workflow not found")

    return WorkflowDetail(
        id=row.id,
        name=row.name,
        description=row.description,
        status=row.status,
        current_version=row.current_version,
        owner_user_id=row.owner_user_id,
        team_id=row.team_id,
        tags=row.tags_json if isinstance(row.tags_json, list) else [],
        metadata=row.metadata_json if isinstance(row.metadata_json, dict) else {},
        created_at=_as_utc(row.created_at) or datetime.now(UTC),
        updated_at=_as_utc(row.updated_at) or datetime.now(UTC),
    )


@router.post(
    "",
    response_model=WorkflowDetail,
    summary="Create Workflow",
    description="Create a new workflow definition.",
)
@require_permission("threads", "write")
async def create_workflow(body: WorkflowCreateRequest, request: Request) -> WorkflowDetail:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request) or "default"

    now = datetime.now(UTC)
    row = WorkflowRow(
        id=_generate_id(),
        name=body.name,
        description=body.description,
        owner_user_id=user_id,
        team_id=body.team_id,
        status="draft",
        current_version=1,
        tags_json=body.tags,
        metadata_json=body.metadata,
        created_at=now,
        updated_at=now,
    )

    async with sf() as session:
        session.add(row)
        await session.commit()
        await session.refresh(row)

    return WorkflowDetail(
        id=row.id,
        name=row.name,
        description=row.description,
        status=row.status,
        current_version=row.current_version,
        owner_user_id=row.owner_user_id,
        team_id=row.team_id,
        tags=row.tags_json if isinstance(row.tags_json, list) else [],
        metadata=row.metadata_json if isinstance(row.metadata_json, dict) else {},
        created_at=_as_utc(row.created_at) or now,
        updated_at=_as_utc(row.updated_at) or now,
    )


@router.patch(
    "/{workflow_id}",
    response_model=WorkflowDetail,
    summary="Update Workflow",
    description="Update an existing workflow.",
)
@require_permission("threads", "write")
async def update_workflow(workflow_id: str, body: WorkflowUpdateRequest, request: Request) -> WorkflowDetail:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        row = await session.get(WorkflowRow, workflow_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Workflow not found")
        if user_id and row.owner_user_id != user_id:
            raise HTTPException(status_code=404, detail="Workflow not found")

        if body.name is not None:
            row.name = body.name
        if body.description is not None:
            row.description = body.description
        if body.status is not None:
            row.status = body.status
        if body.tags is not None:
            row.tags_json = body.tags
        if body.metadata is not None:
            row.metadata_json = body.metadata
        row.updated_at = datetime.now(UTC)
        await session.commit()
        await session.refresh(row)

    return WorkflowDetail(
        id=row.id,
        name=row.name,
        description=row.description,
        status=row.status,
        current_version=row.current_version,
        owner_user_id=row.owner_user_id,
        team_id=row.team_id,
        tags=row.tags_json if isinstance(row.tags_json, list) else [],
        metadata=row.metadata_json if isinstance(row.metadata_json, dict) else {},
        created_at=_as_utc(row.created_at) or datetime.now(UTC),
        updated_at=_as_utc(row.updated_at) or datetime.now(UTC),
    )


@router.delete(
    "/{workflow_id}",
    summary="Delete Workflow",
    description="Delete a workflow and all its versions, nodes, edges, and runs.",
)
@require_permission("threads", "delete")
async def delete_workflow(workflow_id: str, request: Request) -> dict:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        row = await session.get(WorkflowRow, workflow_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Workflow not found")
        if user_id and row.owner_user_id != user_id:
            raise HTTPException(status_code=404, detail="Workflow not found")
        await session.delete(row)
        await session.commit()

    return {"deleted": workflow_id}


@router.get(
    "/{workflow_id}/runs",
    response_model=list[WorkflowRunSummary],
    summary="List Workflow Runs",
    description="List execution runs for a workflow, newest first.",
)
@require_permission("threads", "read")
async def list_workflow_runs(
    workflow_id: str,
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[WorkflowRunSummary]:
    sf = _session_factory_or_503()

    async with sf() as session:
        wf_row = await session.get(WorkflowRow, workflow_id)
        if wf_row is None:
            raise HTTPException(status_code=404, detail="Workflow not found")

        stmt = select(WorkflowRunRow).where(WorkflowRunRow.workflow_id == workflow_id).order_by(WorkflowRunRow.created_at.desc()).limit(limit).offset(offset)
        rows = (await session.execute(stmt)).scalars().all()

    return [
        WorkflowRunSummary(
            id=r.id,
            workflow_id=r.workflow_id,
            status=r.status,
            current_step=r.current_step,
            total_steps=r.total_steps,
            run_id=r.run_id,
            thread_id=r.thread_id,
            error=r.error,
            started_at=_as_utc(r.started_at),
            finished_at=_as_utc(r.finished_at),
            created_at=_as_utc(r.created_at) or datetime.now(UTC),
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Version endpoints (Editor: save/load DAG topology)
# ---------------------------------------------------------------------------


@router.get(
    "/{workflow_id}/versions",
    response_model=list[WorkflowVersionSummary],
    summary="List Workflow Versions",
    description="List all versions of a workflow, newest first.",
)
@require_permission("threads", "read")
async def list_workflow_versions(
    workflow_id: str,
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[WorkflowVersionSummary]:
    sf = _session_factory_or_503()

    async with sf() as session:
        wf = await session.get(WorkflowRow, workflow_id)
        if wf is None:
            raise HTTPException(status_code=404, detail="Workflow not found")

        stmt = select(WorkflowVersionRow).where(WorkflowVersionRow.workflow_id == workflow_id).order_by(WorkflowVersionRow.version.desc()).limit(limit).offset(offset)
        rows = (await session.execute(stmt)).scalars().all()

    return [
        WorkflowVersionSummary(
            id=r.id,
            workflow_id=r.workflow_id,
            version=r.version,
            name=r.name,
            created_by=r.created_by,
            created_at=_as_utc(r.created_at) or datetime.now(UTC),
        )
        for r in rows
    ]


@router.get(
    "/{workflow_id}/versions/{version_id}",
    response_model=WorkflowVersionDetail,
    summary="Get Workflow Version",
    description="Retrieve a version with its full graph, nodes, and edges.",
)
@require_permission("threads", "read")
async def get_workflow_version(workflow_id: str, version_id: str, request: Request) -> WorkflowVersionDetail:
    sf = _session_factory_or_503()

    async with sf() as session:
        ver = await session.get(WorkflowVersionRow, version_id)
        if ver is None or ver.workflow_id != workflow_id:
            raise HTTPException(status_code=404, detail="Version not found")

        nodes = (await session.execute(select(WorkflowNodeRow).where(WorkflowNodeRow.version_id == version_id))).scalars().all()
        edges = (await session.execute(select(WorkflowEdgeRow).where(WorkflowEdgeRow.version_id == version_id))).scalars().all()

    return WorkflowVersionDetail(
        id=ver.id,
        workflow_id=ver.workflow_id,
        version=ver.version,
        name=ver.name,
        created_by=ver.created_by,
        created_at=_as_utc(ver.created_at) or datetime.now(UTC),
        graph=ver.graph_json if isinstance(ver.graph_json, dict) else {},
        nodes=[
            {
                "id": n.id,
                "node_type": n.node_type,
                "name": n.name,
                "config": n.config_json if isinstance(n.config_json, dict) else {},
                "position": n.position_json if isinstance(n.position_json, dict) else {},
            }
            for n in nodes
        ],
        edges=[
            {
                "id": e.id,
                "source_node_id": e.source_node_id,
                "target_node_id": e.target_node_id,
                "condition": e.condition_json if isinstance(e.condition_json, dict) else {},
            }
            for e in edges
        ],
        config=ver.config_json if isinstance(ver.config_json, dict) else {},
    )


@router.post(
    "/{workflow_id}/versions",
    response_model=WorkflowVersionDetail,
    summary="Save Workflow Version",
    description="Create a new version of a workflow with the full DAG topology (editor save).",
)
@require_permission("threads", "write")
async def save_workflow_version(
    workflow_id: str,
    body: WorkflowVersionCreateRequest,
    request: Request,
) -> WorkflowVersionDetail:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        wf = await session.get(WorkflowRow, workflow_id)
        if wf is None:
            raise HTTPException(status_code=404, detail="Workflow not found")
        if user_id and wf.owner_user_id != user_id:
            raise HTTPException(status_code=404, detail="Workflow not found")

        next_version = wf.current_version + 1
        version_id = _generate_version_id()
        now = datetime.now(UTC)
        ver = WorkflowVersionRow(
            id=version_id,
            workflow_id=workflow_id,
            version=next_version,
            name=body.name or wf.name,
            graph_json=body.graph,
            nodes_json=body.nodes,
            edges_json=body.edges,
            config_json=body.config,
            created_by=user_id,
            created_at=now,
        )
        session.add(ver)

        # Create node and edge rows for the new version
        for node_data in body.nodes:
            if not isinstance(node_data, dict):
                continue
            session.add(
                WorkflowNodeRow(
                    id=node_data.get("id") or _generate_node_id(),
                    workflow_id=workflow_id,
                    version_id=version_id,
                    node_type=node_data.get("node_type", "agent"),
                    name=node_data.get("name", "Untitled"),
                    config_json=node_data.get("config", {}),
                    position_json=node_data.get("position", {}),
                )
            )

        for edge_data in body.edges:
            if not isinstance(edge_data, dict):
                continue
            session.add(
                WorkflowEdgeRow(
                    id=edge_data.get("id") or _generate_edge_id(),
                    workflow_id=workflow_id,
                    version_id=version_id,
                    source_node_id=edge_data.get("source_node_id", ""),
                    target_node_id=edge_data.get("target_node_id", ""),
                    condition_json=edge_data.get("condition", {}),
                )
            )

        wf.current_version = next_version
        wf.updated_at = now
        if wf.status == "draft":
            wf.status = "published"
        await session.commit()
        await session.refresh(ver)

    return WorkflowVersionDetail(
        id=ver.id,
        workflow_id=ver.workflow_id,
        version=ver.version,
        name=ver.name,
        created_by=ver.created_by,
        created_at=_as_utc(ver.created_at) or now,
        graph=ver.graph_json if isinstance(ver.graph_json, dict) else {},
        nodes=ver.nodes_json if isinstance(ver.nodes_json, list) else [],
        edges=ver.edges_json if isinstance(ver.edges_json, list) else [],
        config=ver.config_json if isinstance(ver.config_json, dict) else {},
    )


# ---------------------------------------------------------------------------
# Run trigger + steps (Editor Run All + Debugger)
# ---------------------------------------------------------------------------


@router.post(
    "/{workflow_id}/runs",
    response_model=WorkflowRunSummary,
    summary="Trigger Workflow Run",
    description="Trigger a new execution of a workflow (Run All).",
)
@require_permission("runs", "create")
async def trigger_workflow_run(
    workflow_id: str,
    body: WorkflowRunTriggerRequest,
    request: Request,
) -> WorkflowRunSummary:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request) or "default"

    async with sf() as session:
        wf = await session.get(WorkflowRow, workflow_id)
        if wf is None:
            raise HTTPException(status_code=404, detail="Workflow not found")
        if user_id and wf.owner_user_id != user_id:
            raise HTTPException(status_code=404, detail="Workflow not found")

        # Find the current version
        ver = (await session.execute(select(WorkflowVersionRow).where(WorkflowVersionRow.workflow_id == workflow_id).order_by(WorkflowVersionRow.version.desc()).limit(1))).scalar_one_or_none()
        if ver is None:
            raise HTTPException(status_code=409, detail="Workflow has no versions — save the DAG first")

        now = datetime.now(UTC)
        run = WorkflowRunRow(
            id=_generate_run_id(),
            workflow_id=workflow_id,
            version_id=ver.id,
            user_id=user_id,
            status="pending",
            input_json=body.input_data,
            current_step=0,
            total_steps=0,
            created_at=now,
            updated_at=now,
        )
        session.add(run)
        await session.commit()
        await session.refresh(run)

    return WorkflowRunSummary(
        id=run.id,
        workflow_id=run.workflow_id,
        status=run.status,
        current_step=run.current_step,
        total_steps=run.total_steps,
        run_id=run.run_id,
        thread_id=run.thread_id,
        error=run.error,
        started_at=_as_utc(run.started_at),
        finished_at=_as_utc(run.finished_at),
        created_at=_as_utc(run.created_at) or datetime.now(UTC),
    )


@router.get(
    "/{workflow_id}/runs/{run_id}",
    response_model=WorkflowRunSummary,
    summary="Get Workflow Run",
    description="Retrieve a single workflow run by ID.",
)
@require_permission("runs", "read")
async def get_workflow_run(workflow_id: str, run_id: str, request: Request) -> WorkflowRunSummary:
    sf = _session_factory_or_503()

    async with sf() as session:
        run = await session.get(WorkflowRunRow, run_id)
        if run is None or run.workflow_id != workflow_id:
            raise HTTPException(status_code=404, detail="Run not found")

    return WorkflowRunSummary(
        id=run.id,
        workflow_id=run.workflow_id,
        status=run.status,
        current_step=run.current_step,
        total_steps=run.total_steps,
        run_id=run.run_id,
        thread_id=run.thread_id,
        error=run.error,
        started_at=_as_utc(run.started_at),
        finished_at=_as_utc(run.finished_at),
        created_at=_as_utc(run.created_at) or datetime.now(UTC),
    )


@router.get(
    "/{workflow_id}/runs/{run_id}/steps",
    response_model=list[WorkflowRunStepSummary],
    summary="List Run Steps",
    description="List steps (spans) for a workflow run — the debugger's call tree data.",
)
@require_permission("runs", "read")
async def list_workflow_run_steps(
    workflow_id: str,
    run_id: str,
    request: Request,
) -> list[WorkflowRunStepSummary]:
    sf = _session_factory_or_503()

    async with sf() as session:
        run = await session.get(WorkflowRunRow, run_id)
        if run is None or run.workflow_id != workflow_id:
            raise HTTPException(status_code=404, detail="Run not found")

        stmt = select(WorkflowRunStepRow).where(WorkflowRunStepRow.workflow_run_id == run_id).order_by(WorkflowRunStepRow.step_index)
        rows = (await session.execute(stmt)).scalars().all()

    return [
        WorkflowRunStepSummary(
            id=r.id,
            workflow_run_id=r.workflow_run_id,
            node_id=r.node_id,
            node_name=r.node_name,
            step_index=r.step_index,
            status=r.status,
            input=r.input_json if isinstance(r.input_json, dict) else {},
            output=r.output_json if isinstance(r.output_json, dict) else None,
            error=r.error,
            started_at=_as_utc(r.started_at),
            finished_at=_as_utc(r.finished_at),
            checkpoint_id=r.checkpoint_id,
        )
        for r in rows
    ]
