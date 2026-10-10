"""API Keys API — CRUD for user API keys.

Provides endpoints to list, create, revoke, and rotate API keys for
programmatic Gateway access. Key material is hashed at rest; only a prefix
and the full key (on creation) are exposed.
"""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.gateway.authz import require_permission
from app.gateway.deps import get_current_user
from deerflow.persistence.api_keys.model import ApiKeyRow
from deerflow.persistence.engine import get_session_factory

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/api-keys", tags=["api-keys"])

_KEY_PREFIX = "dfk_"
_KEY_RANDOM_BYTES = 24


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class ApiKeySummary(BaseModel):
    """API key list item (no secret)."""

    id: str
    name: str
    key_prefix: str
    scopes: list = Field(default_factory=list)
    status: str
    expires_at: datetime | None = None
    last_used_at: datetime | None = None
    use_count: int = 0
    created_at: datetime


class ApiKeyDetail(ApiKeySummary):
    """Full API key detail (includes plaintext key only on creation)."""

    full_key: str | None = Field(default=None, description="Full key string; only present on create/rotate response")


class ApiKeyStatsResponse(BaseModel):
    """Headline counters for the API keys dashboard."""

    total_keys: int
    active_keys: int
    revoked_keys: int
    expired_keys: int


class ApiKeyCreateRequest(BaseModel):
    """Request body for creating an API key."""

    name: str = Field(..., min_length=1, max_length=128)
    scopes: list = Field(default_factory=list, description="List of permission scopes, e.g. ['runs:create','runs:read']")
    expires_at: datetime | None = Field(default=None, description="Optional expiry timestamp")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _session_factory_or_503():
    sf = get_session_factory()
    if sf is None:
        raise HTTPException(
            status_code=503,
            detail="API Keys API requires a SQL database backend; set database.backend to sqlite or postgres in config.yaml.",
        )
    return sf


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


def _generate_id() -> str:
    return f"key_{secrets.token_hex(12)}"


def _generate_full_key() -> str:
    return _KEY_PREFIX + secrets.token_hex(_KEY_RANDOM_BYTES)


def _hash_key(full_key: str) -> str:
    return hashlib.sha256(full_key.encode()).hexdigest()


def _extract_prefix(full_key: str) -> str:
    return full_key[:12]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/stats",
    response_model=ApiKeyStatsResponse,
    summary="API Key Stats",
    description="Headline counters for API keys.",
)
@require_permission("threads", "read")
async def api_key_stats(request: Request) -> ApiKeyStatsResponse:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        base = select(ApiKeyRow)
        if user_id:
            base = base.where(ApiKeyRow.user_id == user_id)

        total = (await session.scalar(select(func.count()).select_from(base.subquery()))) or 0
        active = (await session.scalar(select(func.count()).select_from(base.where(ApiKeyRow.status == "active").subquery()))) or 0
        revoked = (await session.scalar(select(func.count()).select_from(base.where(ApiKeyRow.status == "revoked").subquery()))) or 0

        now = datetime.now(UTC)
        expired = (await session.scalar(select(func.count()).select_from(base.where(ApiKeyRow.expires_at.isnot(None), ApiKeyRow.expires_at < now).subquery()))) or 0

    return ApiKeyStatsResponse(
        total_keys=total,
        active_keys=active,
        revoked_keys=revoked,
        expired_keys=expired,
    )


@router.get(
    "",
    response_model=list[ApiKeySummary],
    summary="List API Keys",
    description="List API keys for the current user, newest first.",
)
@require_permission("threads", "read")
async def list_api_keys(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None, description="Filter by status (active, revoked)"),
) -> list[ApiKeySummary]:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    stmt = select(ApiKeyRow).order_by(ApiKeyRow.created_at.desc()).limit(limit).offset(offset)
    if user_id:
        stmt = stmt.where(ApiKeyRow.user_id == user_id)
    if status:
        stmt = stmt.where(ApiKeyRow.status == status)

    async with sf() as session:
        rows = (await session.execute(stmt)).scalars().all()

    return [
        ApiKeySummary(
            id=r.id,
            name=r.name,
            key_prefix=r.key_prefix,
            scopes=r.scopes_json if isinstance(r.scopes_json, list) else [],
            status=r.status,
            expires_at=_as_utc(r.expires_at),
            last_used_at=_as_utc(r.last_used_at),
            use_count=r.use_count,
            created_at=_as_utc(r.created_at) or datetime.now(UTC),
        )
        for r in rows
    ]


@router.post(
    "",
    response_model=ApiKeyDetail,
    summary="Create API Key",
    description="Create a new API key. The full key is only returned in this response.",
)
@require_permission("threads", "write")
async def create_api_key(body: ApiKeyCreateRequest, request: Request) -> ApiKeyDetail:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request) or "default"

    full_key = _generate_full_key()
    now = datetime.now(UTC)
    row = ApiKeyRow(
        id=_generate_id(),
        user_id=user_id,
        name=body.name,
        key_hash=_hash_key(full_key),
        key_prefix=_extract_prefix(full_key),
        scopes_json=body.scopes,
        expires_at=body.expires_at,
        status="active",
        created_at=now,
        updated_at=now,
    )

    async with sf() as session:
        session.add(row)
        await session.commit()
        await session.refresh(row)

    return ApiKeyDetail(
        id=row.id,
        name=row.name,
        key_prefix=row.key_prefix,
        scopes=row.scopes_json if isinstance(row.scopes_json, list) else [],
        status=row.status,
        expires_at=_as_utc(row.expires_at),
        last_used_at=_as_utc(row.last_used_at),
        use_count=row.use_count,
        created_at=_as_utc(row.created_at) or now,
        full_key=full_key,
    )


@router.delete(
    "/{key_id}",
    summary="Revoke API Key",
    description="Revoke an API key (soft delete — sets status to 'revoked').",
)
@require_permission("threads", "delete")
async def revoke_api_key(key_id: str, request: Request) -> dict:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        row = await session.get(ApiKeyRow, key_id)
        if row is None:
            raise HTTPException(status_code=404, detail="API key not found")
        if user_id and row.user_id != user_id:
            raise HTTPException(status_code=404, detail="API key not found")
        row.status = "revoked"
        row.updated_at = datetime.now(UTC)
        await session.commit()

    return {"revoked": key_id}


@router.post(
    "/{key_id}/rotate",
    response_model=ApiKeyDetail,
    summary="Rotate API Key",
    description="Generate a new key for an existing API key record. The old key is invalidated.",
)
@require_permission("threads", "write")
async def rotate_api_key(key_id: str, request: Request) -> ApiKeyDetail:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    full_key = _generate_full_key()

    async with sf() as session:
        row = await session.get(ApiKeyRow, key_id)
        if row is None:
            raise HTTPException(status_code=404, detail="API key not found")
        if user_id and row.user_id != user_id:
            raise HTTPException(status_code=404, detail="API key not found")
        row.key_hash = _hash_key(full_key)
        row.key_prefix = _extract_prefix(full_key)
        row.status = "active"
        row.use_count = 0
        row.last_used_at = None
        row.updated_at = datetime.now(UTC)
        await session.commit()
        await session.refresh(row)

    return ApiKeyDetail(
        id=row.id,
        name=row.name,
        key_prefix=row.key_prefix,
        scopes=row.scopes_json if isinstance(row.scopes_json, list) else [],
        status=row.status,
        expires_at=_as_utc(row.expires_at),
        last_used_at=_as_utc(row.last_used_at),
        use_count=row.use_count,
        created_at=_as_utc(row.created_at) or datetime.now(UTC),
        full_key=full_key,
    )
