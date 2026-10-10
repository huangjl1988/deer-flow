"""Logs API — structured application log ingestion, search, and streaming.

Provides endpoints to list, search, and stream logs emitted by Gateway,
Scheduler, Sandbox, and Frontend services. Includes a POST endpoint for
services to push structured log entries and an SSE endpoint for real-time
streaming.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from app.gateway.authz import require_permission
from app.gateway.deps import get_current_user
from deerflow.persistence.engine import get_session_factory
from deerflow.persistence.logs.model import LogRow

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/logs", tags=["logs"])

_VALID_LEVELS = {"error", "warn", "info", "debug"}
_VALID_SERVICES = {"gateway", "frontend", "scheduler", "sandbox"}

# In-memory ring buffer for SSE streaming; recent logs are kept here so
# the SSE endpoint can tail them without polling the database in a tight loop.
_LOG_BUFFER: list[dict[str, Any]] = []
_LOG_BUFFER_MAX = 500
_LOG_EVENT = asyncio.Event()


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class LogEntry(BaseModel):
    """A single log entry."""

    id: int
    timestamp: datetime
    level: str
    service: str
    message: str
    thread_id: str | None = None
    run_id: str | None = None
    trace_id: str | None = None
    metadata: dict = Field(default_factory=dict)


class LogsListResponse(BaseModel):
    """Paginated log listing."""

    logs: list[LogEntry]
    has_more: bool


class LogStatsResponse(BaseModel):
    """Level-based counters for the logs dashboard."""

    total: int = 0
    error: int = 0
    warn: int = 0
    info: int = 0
    debug: int = 0


class LogIngestRequest(BaseModel):
    """Request body for ingesting a log entry."""

    level: str = Field(..., description="error | warn | info | debug")
    service: str = Field(..., description="gateway | frontend | scheduler | sandbox")
    message: str = Field(..., min_length=1)
    thread_id: str | None = None
    run_id: str | None = None
    trace_id: str | None = None
    metadata: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _session_factory_or_503():
    sf = get_session_factory()
    if sf is None:
        raise HTTPException(
            status_code=503,
            detail="Logs API requires a SQL database backend; set database.backend to sqlite or postgres in config.yaml.",
        )
    return sf


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


def _row_to_entry(row: LogRow) -> LogEntry:
    return LogEntry(
        id=row.id,
        timestamp=_as_utc(row.timestamp) or datetime.now(UTC),
        level=row.level,
        service=row.service,
        message=row.message,
        thread_id=row.thread_id,
        run_id=row.run_id,
        trace_id=row.trace_id,
        metadata=row.metadata_json if isinstance(row.metadata_json, dict) else {},
    )


def _push_to_buffer(entry: dict[str, Any]) -> None:
    """Append to the in-memory ring buffer for SSE consumers."""
    _LOG_BUFFER.append(entry)
    if len(_LOG_BUFFER) > _LOG_BUFFER_MAX:
        del _LOG_BUFFER[: len(_LOG_BUFFER) - _LOG_BUFFER_MAX]
    _LOG_EVENT.set()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/stats",
    response_model=LogStatsResponse,
    summary="Log Stats",
    description="Level-based counters for the logs dashboard.",
)
@require_permission("runs", "read")
async def log_stats(
    request: Request,
    service: str | None = Query(default=None, description="Filter by service"),
) -> LogStatsResponse:
    sf = _session_factory_or_503()

    async with sf() as session:
        base = select(LogRow)
        if service:
            base = base.where(LogRow.service == service)

        total = (await session.scalar(select(func.count()).select_from(base.subquery()))) or 0

        counts: dict[str, int] = {}
        for level in _VALID_LEVELS:
            stmt = base.where(LogRow.level == level)
            counts[level] = (await session.scalar(select(func.count()).select_from(stmt.subquery()))) or 0

    return LogStatsResponse(
        total=total,
        error=counts.get("error", 0),
        warn=counts.get("warn", 0),
        info=counts.get("info", 0),
        debug=counts.get("debug", 0),
    )


@router.get(
    "",
    response_model=LogsListResponse,
    summary="List Logs",
    description="List logs with level/service/search filters, newest first.",
)
@require_permission("runs", "read")
async def list_logs(
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    level: str | None = Query(default=None, description="Filter by level (error/warn/info/debug)"),
    service: str | None = Query(default=None, description="Filter by service"),
    search: str | None = Query(default=None, description="Full-text search in message"),
) -> LogsListResponse:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    stmt = select(LogRow).order_by(LogRow.timestamp.desc()).limit(limit).offset(offset)
    if user_id:
        stmt = stmt.where(or_(LogRow.user_id == user_id, LogRow.user_id.is_(None)))
    if level:
        stmt = stmt.where(LogRow.level == level)
    if service:
        stmt = stmt.where(LogRow.service == service)
    if search:
        stmt = stmt.where(LogRow.message.ilike(f"%{search}%"))

    async with sf() as session:
        rows = (await session.execute(stmt)).scalars().all()

    logs = [_row_to_entry(r) for r in rows]
    has_more = len(logs) == limit
    return LogsListResponse(logs=logs, has_more=has_more)


@router.post(
    "",
    response_model=LogEntry,
    summary="Ingest Log",
    description="Push a structured log entry. Used by services to emit logs.",
)
async def ingest_log(body: LogIngestRequest, request: Request) -> LogEntry:
    if body.level not in _VALID_LEVELS:
        raise HTTPException(status_code=422, detail=f"Invalid level '{body.level}'. Must be one of: {', '.join(sorted(_VALID_LEVELS))}")
    if body.service not in _VALID_SERVICES:
        raise HTTPException(status_code=422, detail=f"Invalid service '{body.service}'. Must be one of: {', '.join(sorted(_VALID_SERVICES))}")

    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    now = datetime.now(UTC)
    row = LogRow(
        timestamp=now,
        level=body.level,
        service=body.service,
        message=body.message,
        user_id=user_id,
        thread_id=body.thread_id,
        run_id=body.run_id,
        trace_id=body.trace_id,
        metadata_json=body.metadata,
    )

    async with sf() as session:
        session.add(row)
        await session.commit()
        await session.refresh(row)

    entry = _row_to_entry(row)
    _push_to_buffer(entry.model_dump(mode="json"))
    return entry


@router.get(
    "/stream",
    summary="Stream Logs",
    description="SSE stream of recent logs. Use EventSource to subscribe.",
)
@require_permission("runs", "read")
async def stream_logs(
    request: Request,
    level: str | None = Query(default=None, description="Filter by level"),
    service: str | None = Query(default=None, description="Filter by service"),
) -> StreamingResponse:
    """Stream log entries via Server-Sent Events.

    Polls the in-memory buffer and database for new entries, sending them
    as SSE ``data:`` events. The client should reconnect on disconnect.
    """

    async def event_generator():
        last_id = 0

        # Send recent buffer entries on connect
        snapshot = list(_LOG_BUFFER)
        for entry in snapshot:
            if level and entry.get("level") != level:
                continue
            if service and entry.get("service") != service:
                continue
            if entry.get("id", 0) <= last_id:
                continue
            last_id = entry["id"]
            yield f"data: {json.dumps(entry, default=str)}\n\n"

        # Tail loop: poll database for new entries
        sf = get_session_factory()
        while True:
            if await request.is_disconnected():
                break

            if sf is not None:
                stmt = select(LogRow).where(LogRow.id > last_id).order_by(LogRow.id).limit(50)
                if level:
                    stmt = stmt.where(LogRow.level == level)
                if service:
                    stmt = stmt.where(LogRow.service == service)

                try:
                    async with sf() as session:
                        rows = (await session.execute(stmt)).scalars().all()
                    for row in rows:
                        entry = _row_to_entry(row)
                        last_id = row.id
                        yield f"data: {entry.model_dump_json()}\n\n"
                except Exception:
                    logger.debug("Log stream DB poll failed", exc_info=True)

            # Heartbeat to keep the connection alive
            yield ": heartbeat\n\n"
            await asyncio.sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
