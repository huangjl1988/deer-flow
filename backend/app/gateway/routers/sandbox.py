"""Sandbox API — sandbox pool, instance, and lease management.

Provides endpoints to list, create, delete sandbox pools,
list instances within a pool, and list active leases.
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
from deerflow.persistence.sandbox.model import (
    SandboxInstanceRow,
    SandboxLeaseRow,
    SandboxPoolRow,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sandbox", tags=["sandbox"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class SandboxPoolSummary(BaseModel):
    """Sandbox pool list item."""

    id: str
    name: str
    provider: str
    pool_size: int
    min_idle: int
    status: str
    team_id: str | None = None
    created_at: datetime
    updated_at: datetime


class SandboxPoolDetail(SandboxPoolSummary):
    """Full pool detail."""

    owner_user_id: str
    config: dict = Field(default_factory=dict)
    instance_count: int = 0


class SandboxInstanceSummary(BaseModel):
    """Sandbox instance list item."""

    id: str
    pool_id: str
    instance_ref: str
    status: str
    health: str
    last_health_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class SandboxLeaseSummary(BaseModel):
    """Sandbox lease list item."""

    id: str
    instance_id: str
    thread_id: str | None = None
    run_id: str | None = None
    user_id: str | None = None
    status: str
    leased_at: datetime
    expires_at: datetime
    released_at: datetime | None = None


class SandboxStatsResponse(BaseModel):
    """Headline counters for the sandbox dashboard."""

    total_pools: int
    active_pools: int
    total_instances: int
    idle_instances: int
    busy_instances: int
    active_leases: int


class SandboxPoolCreateRequest(BaseModel):
    """Request body for creating a sandbox pool."""

    name: str = Field(..., min_length=1, max_length=128)
    provider: str = Field(..., description="local | aio | opensandbox | e2b | boxlite")
    pool_size: int = Field(default=1, ge=1, le=100)
    min_idle: int = Field(default=0, ge=0)
    team_id: str | None = None
    config: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _session_factory_or_503():
    sf = get_session_factory()
    if sf is None:
        raise HTTPException(
            status_code=503,
            detail="Sandbox API requires a SQL database backend.",
        )
    return sf


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


def _generate_id() -> str:
    return f"sbp_{secrets.token_hex(12)}"


def _generate_instance_id() -> str:
    return f"sbi_{secrets.token_hex(12)}"


def _generate_lease_id() -> str:
    return f"sbl_{secrets.token_hex(12)}"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=SandboxStatsResponse, summary="Sandbox Stats")
@require_permission("threads", "read")
async def sandbox_stats(request: Request) -> SandboxStatsResponse:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        pool_base = select(SandboxPoolRow)
        if user_id:
            pool_base = pool_base.where(SandboxPoolRow.owner_user_id == user_id)

        total_pools = (await session.scalar(select(func.count()).select_from(pool_base.subquery()))) or 0
        active_pools = (await session.scalar(select(func.count()).select_from(pool_base.where(SandboxPoolRow.status == "active").subquery()))) or 0

        inst_base = select(SandboxInstanceRow).join(SandboxPoolRow, SandboxPoolRow.id == SandboxInstanceRow.pool_id)
        if user_id:
            inst_base = inst_base.where(SandboxPoolRow.owner_user_id == user_id)

        total_instances = (await session.scalar(select(func.count()).select_from(inst_base.subquery()))) or 0
        idle_instances = (await session.scalar(select(func.count()).select_from(inst_base.where(SandboxInstanceRow.status == "idle").subquery()))) or 0
        busy_instances = (await session.scalar(select(func.count()).select_from(inst_base.where(SandboxInstanceRow.status == "busy").subquery()))) or 0

        lease_base = select(SandboxLeaseRow).join(SandboxInstanceRow, SandboxInstanceRow.id == SandboxLeaseRow.instance_id).join(SandboxPoolRow, SandboxPoolRow.id == SandboxInstanceRow.pool_id)
        if user_id:
            lease_base = lease_base.where(SandboxPoolRow.owner_user_id == user_id)
        active_leases = (await session.scalar(select(func.count()).select_from(lease_base.where(SandboxLeaseRow.status == "active").subquery()))) or 0

    return SandboxStatsResponse(
        total_pools=total_pools,
        active_pools=active_pools,
        total_instances=total_instances,
        idle_instances=idle_instances,
        busy_instances=busy_instances,
        active_leases=active_leases,
    )


@router.get("/pools", response_model=list[SandboxPoolSummary], summary="List Sandbox Pools")
@require_permission("threads", "read")
async def list_pools(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
) -> list[SandboxPoolSummary]:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    stmt = select(SandboxPoolRow).order_by(SandboxPoolRow.created_at.desc()).limit(limit).offset(offset)
    if user_id:
        stmt = stmt.where(SandboxPoolRow.owner_user_id == user_id)
    if status:
        stmt = stmt.where(SandboxPoolRow.status == status)

    async with sf() as session:
        rows = (await session.execute(stmt)).scalars().all()

    return [
        SandboxPoolSummary(
            id=r.id,
            name=r.name,
            provider=r.provider,
            pool_size=r.pool_size,
            min_idle=r.min_idle,
            status=r.status,
            team_id=r.team_id,
            created_at=_as_utc(r.created_at) or datetime.now(UTC),
            updated_at=_as_utc(r.updated_at) or datetime.now(UTC),
        )
        for r in rows
    ]


@router.get("/pools/{pool_id}", response_model=SandboxPoolDetail, summary="Get Sandbox Pool")
@require_permission("threads", "read")
async def get_pool(pool_id: str, request: Request) -> SandboxPoolDetail:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        row = await session.get(SandboxPoolRow, pool_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Sandbox pool not found")
        if user_id and row.owner_user_id != user_id:
            raise HTTPException(status_code=404, detail="Sandbox pool not found")

        inst_count = await session.scalar(select(func.count()).select_from(select(SandboxInstanceRow).where(SandboxInstanceRow.pool_id == pool_id).subquery())) or 0

    return SandboxPoolDetail(
        id=row.id,
        name=row.name,
        provider=row.provider,
        pool_size=row.pool_size,
        min_idle=row.min_idle,
        status=row.status,
        owner_user_id=row.owner_user_id,
        team_id=row.team_id,
        config=row.config_json if isinstance(row.config_json, dict) else {},
        instance_count=inst_count,
        created_at=_as_utc(row.created_at) or datetime.now(UTC),
        updated_at=_as_utc(row.updated_at) or datetime.now(UTC),
    )


@router.post("/pools", response_model=SandboxPoolDetail, summary="Create Sandbox Pool")
@require_permission("threads", "write")
async def create_pool(body: SandboxPoolCreateRequest, request: Request) -> SandboxPoolDetail:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request) or "default"

    now = datetime.now(UTC)
    row = SandboxPoolRow(
        id=_generate_id(),
        name=body.name,
        owner_user_id=user_id,
        team_id=body.team_id,
        provider=body.provider,
        pool_size=body.pool_size,
        min_idle=body.min_idle,
        status="active",
        config_json=body.config,
        created_at=now,
        updated_at=now,
    )

    async with sf() as session:
        session.add(row)
        await session.commit()
        await session.refresh(row)

    return SandboxPoolDetail(
        id=row.id,
        name=row.name,
        provider=row.provider,
        pool_size=row.pool_size,
        min_idle=row.min_idle,
        status=row.status,
        owner_user_id=row.owner_user_id,
        team_id=row.team_id,
        config=row.config_json if isinstance(row.config_json, dict) else {},
        instance_count=0,
        created_at=_as_utc(row.created_at) or now,
        updated_at=_as_utc(row.updated_at) or now,
    )


@router.delete("/pools/{pool_id}", summary="Delete Sandbox Pool")
@require_permission("threads", "delete")
async def delete_pool(pool_id: str, request: Request) -> dict:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        row = await session.get(SandboxPoolRow, pool_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Sandbox pool not found")
        if user_id and row.owner_user_id != user_id:
            raise HTTPException(status_code=404, detail="Sandbox pool not found")
        await session.delete(row)
        await session.commit()

    return {"deleted": pool_id}


@router.get("/pools/{pool_id}/instances", response_model=list[SandboxInstanceSummary], summary="List Pool Instances")
@require_permission("threads", "read")
async def list_instances(
    pool_id: str,
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[SandboxInstanceSummary]:
    sf = _session_factory_or_503()

    async with sf() as session:
        pool = await session.get(SandboxPoolRow, pool_id)
        if pool is None:
            raise HTTPException(status_code=404, detail="Sandbox pool not found")

        stmt = select(SandboxInstanceRow).where(SandboxInstanceRow.pool_id == pool_id).order_by(SandboxInstanceRow.created_at.desc()).limit(limit).offset(offset)
        rows = (await session.execute(stmt)).scalars().all()

    return [
        SandboxInstanceSummary(
            id=r.id,
            pool_id=r.pool_id,
            instance_ref=r.instance_ref,
            status=r.status,
            health=r.health,
            last_health_at=_as_utc(r.last_health_at),
            created_at=_as_utc(r.created_at) or datetime.now(UTC),
            updated_at=_as_utc(r.updated_at) or datetime.now(UTC),
        )
        for r in rows
    ]


@router.get("/pools/{pool_id}/leases", response_model=list[SandboxLeaseSummary], summary="List Pool Leases")
@require_permission("threads", "read")
async def list_leases(
    pool_id: str,
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[SandboxLeaseSummary]:
    sf = _session_factory_or_503()

    async with sf() as session:
        pool = await session.get(SandboxPoolRow, pool_id)
        if pool is None:
            raise HTTPException(status_code=404, detail="Sandbox pool not found")

        stmt = select(SandboxLeaseRow).join(SandboxInstanceRow, SandboxInstanceRow.id == SandboxLeaseRow.instance_id).where(SandboxInstanceRow.pool_id == pool_id).order_by(SandboxLeaseRow.leased_at.desc()).limit(limit).offset(offset)
        rows = (await session.execute(stmt)).scalars().all()

    return [
        SandboxLeaseSummary(
            id=r.id,
            instance_id=r.instance_id,
            thread_id=r.thread_id,
            run_id=r.run_id,
            user_id=r.user_id,
            status=r.status,
            leased_at=_as_utc(r.leased_at) or datetime.now(UTC),
            expires_at=_as_utc(r.expires_at) or datetime.now(UTC),
            released_at=_as_utc(r.released_at),
        )
        for r in rows
    ]
