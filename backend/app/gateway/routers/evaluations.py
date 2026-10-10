"""Evaluations API — CRUD for evaluation definitions and run history.

Provides endpoints to list, create, retrieve, and delete evaluations,
plus listing evaluation runs (execution history with pass/fail counts).
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
from deerflow.persistence.evaluations.model import (
    EvaluationRow,
    EvaluationRunRow,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/evaluations", tags=["evaluations"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class EvaluationSummary(BaseModel):
    """Evaluation list item."""

    id: str
    name: str
    description: str = ""
    target_type: str
    target_id: str
    dataset_id: str
    status: str
    total_runs: int = 0
    last_run_status: str | None = None
    last_run_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class EvaluationDetail(BaseModel):
    """Full evaluation detail."""

    id: str
    name: str
    description: str = ""
    owner_user_id: str
    team_id: str | None = None
    target_type: str
    target_id: str
    dataset_id: str
    dataset_version: int | None = None
    metrics_json: list = Field(default_factory=list)
    config_json: dict = Field(default_factory=dict)
    status: str
    created_at: datetime
    updated_at: datetime


class EvaluationRunSummary(BaseModel):
    """Evaluation run list item."""

    id: str
    evaluation_id: str
    status: str
    total_cases: int = 0
    passed_cases: int = 0
    failed_cases: int = 0
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime


class EvaluationStatsResponse(BaseModel):
    """Headline counters for the evaluations dashboard."""

    total_evaluations: int
    total_runs: int
    passed_runs: int
    failed_runs: int
    pending_runs: int


class EvaluationCreateRequest(BaseModel):
    """Request body for creating an evaluation."""

    name: str = Field(..., min_length=1, max_length=128)
    description: str = ""
    target_type: str = Field(..., description="agent | workflow")
    target_id: str = Field(..., min_length=1)
    dataset_id: str = Field(..., min_length=1)
    metrics_json: list = Field(default_factory=list)
    config_json: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _session_factory_or_503():
    sf = get_session_factory()
    if sf is None:
        raise HTTPException(
            status_code=503,
            detail="Evaluations API requires a SQL database backend; set database.backend to sqlite or postgres in config.yaml.",
        )
    return sf


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


def _generate_id() -> str:
    return f"eval_{secrets.token_hex(12)}"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/stats",
    response_model=EvaluationStatsResponse,
    summary="Evaluation Stats",
    description="Headline counters for evaluations and runs.",
)
@require_permission("runs", "read")
async def evaluation_stats(request: Request) -> EvaluationStatsResponse:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        eval_where = ()
        if user_id:
            eval_where = (EvaluationRow.owner_user_id == user_id,)

        total_evaluations = (await session.scalar(select(func.count()).select_from(EvaluationRow).where(*eval_where))) or 0

        run_stmt = select(EvaluationRunRow).join(EvaluationRow, EvaluationRow.id == EvaluationRunRow.evaluation_id)
        if user_id:
            run_stmt = run_stmt.where(EvaluationRow.owner_user_id == user_id)

        total_runs = (await session.scalar(select(func.count()).select_from(run_stmt.subquery()))) or 0
        passed_runs = (await session.scalar(select(func.count()).select_from(run_stmt.where(EvaluationRunRow.status == "success").subquery()))) or 0
        failed_runs = (await session.scalar(select(func.count()).select_from(run_stmt.where(EvaluationRunRow.status == "error").subquery()))) or 0
        pending_runs = (await session.scalar(select(func.count()).select_from(run_stmt.where(EvaluationRunRow.status.in_(("pending", "running"))).subquery()))) or 0

    return EvaluationStatsResponse(
        total_evaluations=total_evaluations,
        total_runs=total_runs,
        passed_runs=passed_runs,
        failed_runs=failed_runs,
        pending_runs=pending_runs,
    )


@router.get(
    "",
    response_model=list[EvaluationSummary],
    summary="List Evaluations",
    description="List evaluations for the current user, newest first.",
)
@require_permission("runs", "read")
async def list_evaluations(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None, description="Filter by status (draft, active, archived)"),
) -> list[EvaluationSummary]:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    stmt = select(EvaluationRow, EvaluationRunRow).outerjoin(EvaluationRunRow, EvaluationRunRow.evaluation_id == EvaluationRow.id).order_by(EvaluationRow.created_at.desc()).limit(limit).offset(offset)
    if user_id:
        stmt = stmt.where(EvaluationRow.owner_user_id == user_id)
    if status:
        stmt = stmt.where(EvaluationRow.status == status)

    async with sf() as session:
        rows = (await session.execute(stmt)).all()

    # Group runs by evaluation
    eval_map: dict[str, dict] = {}
    for eval_row, run_row in rows:
        eid = eval_row.id
        if eid not in eval_map:
            eval_map[eid] = {
                "row": eval_row,
                "total_runs": 0,
                "last_run_status": None,
                "last_run_at": None,
            }
        if run_row:
            eval_map[eid]["total_runs"] += 1
            run_created = _as_utc(run_row.created_at)
            if eval_map[eid]["last_run_at"] is None or (run_created and run_created > eval_map[eid]["last_run_at"]):
                eval_map[eid]["last_run_status"] = run_row.status
                eval_map[eid]["last_run_at"] = run_created

    return [
        EvaluationSummary(
            id=e["row"].id,
            name=e["row"].name,
            description=e["row"].description,
            target_type=e["row"].target_type,
            target_id=e["row"].target_id,
            dataset_id=e["row"].dataset_id,
            status=e["row"].status,
            total_runs=e["total_runs"],
            last_run_status=e["last_run_status"],
            last_run_at=e["last_run_at"],
            created_at=_as_utc(e["row"].created_at),
            updated_at=_as_utc(e["row"].updated_at),
        )
        for e in eval_map.values()
    ]


@router.get(
    "/{evaluation_id}",
    response_model=EvaluationDetail,
    summary="Get Evaluation",
    description="Retrieve a single evaluation by ID.",
)
@require_permission("runs", "read")
async def get_evaluation(evaluation_id: str, request: Request) -> EvaluationDetail:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        row = await session.get(EvaluationRow, evaluation_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Evaluation not found")
        if user_id and row.owner_user_id != user_id:
            raise HTTPException(status_code=404, detail="Evaluation not found")

    return EvaluationDetail(
        id=row.id,
        name=row.name,
        description=row.description,
        owner_user_id=row.owner_user_id,
        team_id=row.team_id,
        target_type=row.target_type,
        target_id=row.target_id,
        dataset_id=row.dataset_id,
        dataset_version=row.dataset_version,
        metrics_json=row.metrics_json,
        config_json=row.config_json,
        status=row.status,
        created_at=_as_utc(row.created_at),
        updated_at=_as_utc(row.updated_at),
    )


@router.post(
    "",
    response_model=EvaluationDetail,
    summary="Create Evaluation",
    description="Create a new evaluation definition.",
)
@require_permission("runs", "create")
async def create_evaluation(body: EvaluationCreateRequest, request: Request) -> EvaluationDetail:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request) or "default"

    now = datetime.now(UTC)
    row = EvaluationRow(
        id=_generate_id(),
        name=body.name,
        description=body.description,
        owner_user_id=user_id,
        target_type=body.target_type,
        target_id=body.target_id,
        dataset_id=body.dataset_id,
        metrics_json=body.metrics_json,
        config_json=body.config_json,
        status="draft",
        created_at=now,
        updated_at=now,
    )

    async with sf() as session:
        session.add(row)
        await session.commit()
        await session.refresh(row)

    return EvaluationDetail(
        id=row.id,
        name=row.name,
        description=row.description,
        owner_user_id=row.owner_user_id,
        team_id=row.team_id,
        target_type=row.target_type,
        target_id=row.target_id,
        dataset_id=row.dataset_id,
        dataset_version=row.dataset_version,
        metrics_json=row.metrics_json,
        config_json=row.config_json,
        status=row.status,
        created_at=_as_utc(row.created_at),
        updated_at=_as_utc(row.updated_at),
    )


@router.delete(
    "/{evaluation_id}",
    summary="Delete Evaluation",
    description="Delete an evaluation and all its runs, cases, and results.",
)
@require_permission("runs", "cancel")
async def delete_evaluation(evaluation_id: str, request: Request) -> dict:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        row = await session.get(EvaluationRow, evaluation_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Evaluation not found")
        if user_id and row.owner_user_id != user_id:
            raise HTTPException(status_code=404, detail="Evaluation not found")
        await session.delete(row)
        await session.commit()

    return {"deleted": evaluation_id}


@router.get(
    "/{evaluation_id}/runs",
    response_model=list[EvaluationRunSummary],
    summary="List Evaluation Runs",
    description="List execution runs for an evaluation, newest first.",
)
@require_permission("runs", "read")
async def list_evaluation_runs(
    evaluation_id: str,
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[EvaluationRunSummary]:
    sf = _session_factory_or_503()

    async with sf() as session:
        eval_row = await session.get(EvaluationRow, evaluation_id)
        if eval_row is None:
            raise HTTPException(status_code=404, detail="Evaluation not found")

        stmt = select(EvaluationRunRow).where(EvaluationRunRow.evaluation_id == evaluation_id).order_by(EvaluationRunRow.created_at.desc()).limit(limit).offset(offset)
        rows = (await session.execute(stmt)).scalars().all()

    return [
        EvaluationRunSummary(
            id=r.id,
            evaluation_id=r.evaluation_id,
            status=r.status,
            total_cases=r.total_cases,
            passed_cases=r.passed_cases,
            failed_cases=r.failed_cases,
            started_at=_as_utc(r.started_at),
            finished_at=_as_utc(r.finished_at),
            created_at=_as_utc(r.created_at),
        )
        for r in rows
    ]
