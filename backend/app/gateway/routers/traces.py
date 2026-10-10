"""Traces API — execution chain tracing for agent runs.

A "trace" maps to a run; its "spans" are the run events recorded during
execution. This is a read-only reporting layer over the harness-owned
``runs`` and ``run_events`` tables, mirroring the console router pattern.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.gateway.authz import require_permission
from app.gateway.deps import get_current_user
from deerflow.persistence.engine import get_session_factory
from deerflow.persistence.models.run_event import RunEventRow
from deerflow.persistence.run.model import RunRow

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/traces", tags=["traces"])

_FAILED_STATUSES = ("error", "timeout")


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class TraceStatsResponse(BaseModel):
    """Headline counters for the traces dashboard."""

    total_traces: int = Field(..., description="Total recorded runs (traces)")
    success_rate: float = Field(..., description="Percentage of runs that succeeded")
    avg_duration_seconds: float = Field(default=0.0, description="Average run duration in seconds")
    total_spans: int = Field(..., description="Total run events across all traces")


class TraceSummary(BaseModel):
    """One trace (run) in the listing."""

    run_id: str
    thread_id: str
    assistant_id: str | None = None
    status: str
    span_count: int = 0
    model_name: str | None = None
    total_tokens: int = 0
    duration_seconds: float | None = Field(default=None, description="Wall-clock duration")
    created_at: datetime | None = None
    updated_at: datetime | None = None
    first_message: str | None = Field(default=None, description="First human message excerpt")
    error: str | None = Field(default=None, description="Error excerpt for failed runs")


class TraceDetail(TraceSummary):
    """Full trace detail with all spans."""

    spans: list[TraceSpan] = Field(default_factory=list)


class TraceSpan(BaseModel):
    """A single span (run event) within a trace."""

    id: int
    seq: int
    event_type: str
    category: str
    content: str = ""
    created_at: datetime
    metadata: dict = Field(default_factory=dict)


class TracesListResponse(BaseModel):
    """Paginated trace listing."""

    traces: list[TraceSummary]
    has_more: bool


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _session_factory_or_503():
    sf = get_session_factory()
    if sf is None:
        raise HTTPException(
            status_code=503,
            detail="Traces API requires a SQL database backend; set database.backend to sqlite or postgres in config.yaml.",
        )
    return sf


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


def _duration_seconds(created: datetime | None, updated: datetime | None) -> float | None:
    if created is None or updated is None:
        return None
    start = created if created.tzinfo else created.replace(tzinfo=UTC)
    end = updated if updated.tzinfo else updated.replace(tzinfo=UTC)
    delta = (end - start).total_seconds()
    return round(delta, 3) if delta >= 0 else None


_ERROR_EXCERPT_CHARS = 300


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/stats",
    response_model=TraceStatsResponse,
    summary="Trace Stats",
    description="Headline counters for traces and spans.",
)
@require_permission("runs", "read")
async def trace_stats(request: Request) -> TraceStatsResponse:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        run_stmt = select(RunRow)
        if user_id:
            run_stmt = run_stmt.where(RunRow.user_id == user_id)

        total_traces = (await session.scalar(select(func.count()).select_from(run_stmt.subquery()))) or 0

        success_stmt = run_stmt.where(RunRow.status == "success")
        success_count = (await session.scalar(select(func.count()).select_from(success_stmt.subquery()))) or 0

        span_stmt = select(RunEventRow)
        if user_id:
            span_stmt = span_stmt.where(RunEventRow.user_id == user_id)
        total_spans = (await session.scalar(select(func.count()).select_from(span_stmt.subquery()))) or 0

        # Average duration: compute from completed runs (created_at + updated_at both present)
        avg_stmt = select(func.avg(func.extract("epoch", RunRow.updated_at - RunRow.created_at))).where(
            RunRow.updated_at.isnot(None),
            RunRow.created_at.isnot(None),
        )
        if user_id:
            avg_stmt = avg_stmt.where(RunRow.user_id == user_id)
        avg_duration = (await session.scalar(avg_stmt)) or 0.0

    success_rate = round((success_count / total_traces) * 100, 2) if total_traces > 0 else 0.0

    return TraceStatsResponse(
        total_traces=total_traces,
        success_rate=success_rate,
        avg_duration_seconds=round(float(avg_duration), 3),
        total_spans=total_spans,
    )


@router.get(
    "",
    response_model=TracesListResponse,
    summary="List Traces",
    description="List traces (runs) for the current user, newest first.",
)
@require_permission("runs", "read")
async def list_traces(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None, description="Filter by run status"),
    service: str | None = Query(default=None, description="Filter by assistant_id (service)"),
) -> TracesListResponse:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    stmt = select(RunRow, func.count(RunEventRow.id).label("span_count")).outerjoin(RunEventRow, RunEventRow.run_id == RunRow.run_id).group_by(RunRow.run_id).order_by(RunRow.created_at.desc()).limit(limit).offset(offset)
    if user_id:
        stmt = stmt.where(RunRow.user_id == user_id)
    if status:
        stmt = stmt.where(RunRow.status == status)
    if service:
        stmt = stmt.where(RunRow.assistant_id == service)

    async with sf() as session:
        rows = (await session.execute(stmt)).all()

    traces = [
        TraceSummary(
            run_id=row.run_id,
            thread_id=row.thread_id,
            assistant_id=row.assistant_id,
            status=row.status,
            span_count=span_count,
            model_name=row.model_name,
            total_tokens=row.total_tokens,
            duration_seconds=_duration_seconds(row.created_at, row.updated_at),
            created_at=_as_utc(row.created_at),
            updated_at=_as_utc(row.updated_at),
            first_message=(row.first_human_message or "")[:200] or None,
            error=(row.error[:_ERROR_EXCERPT_CHARS] if row.error else None),
        )
        for row, span_count in rows
    ]

    has_more = len(traces) == limit
    return TracesListResponse(traces=traces, has_more=has_more)


@router.get(
    "/{run_id}",
    response_model=TraceDetail,
    summary="Get Trace",
    description="Retrieve a single trace (run) with all its spans (events).",
)
@require_permission("runs", "read")
async def get_trace(run_id: str, request: Request) -> TraceDetail:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        run_row = await session.get(RunRow, run_id)
        if run_row is None:
            raise HTTPException(status_code=404, detail="Trace not found")
        if user_id and run_row.user_id != user_id:
            raise HTTPException(status_code=404, detail="Trace not found")

        span_stmt = select(RunEventRow).where(RunEventRow.run_id == run_id).order_by(RunEventRow.seq)
        span_rows = (await session.execute(span_stmt)).scalars().all()

        span_count = len(span_rows)

    spans = [
        TraceSpan(
            id=s.id,
            seq=s.seq,
            event_type=s.event_type,
            category=s.category,
            content=s.content,
            created_at=_as_utc(s.created_at) or datetime.now(UTC),
            metadata=s.event_metadata if isinstance(s.event_metadata, dict) else {},
        )
        for s in span_rows
    ]

    return TraceDetail(
        run_id=run_row.run_id,
        thread_id=run_row.thread_id,
        assistant_id=run_row.assistant_id,
        status=run_row.status,
        span_count=span_count,
        model_name=run_row.model_name,
        total_tokens=run_row.total_tokens,
        duration_seconds=_duration_seconds(run_row.created_at, run_row.updated_at),
        created_at=_as_utc(run_row.created_at),
        updated_at=_as_utc(run_row.updated_at),
        first_message=(run_row.first_human_message or "")[:200] or None,
        error=(run_row.error[:_ERROR_EXCERPT_CHARS] if run_row.error else None),
        spans=spans,
    )
