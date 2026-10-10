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
from deerflow.persistence.workflows.model import WorkflowRow, WorkflowRunRow

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
