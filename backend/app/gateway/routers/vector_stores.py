"""Vector Stores API — vector store, collection, and document management.

Provides endpoints to list, create, retrieve, delete vector stores,
list collections within a store, and query test.
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
from deerflow.persistence.vector_stores.model import (
    VectorStoreCollectionRow,
    VectorStoreRow,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/vector-stores", tags=["vector-stores"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class VectorStoreSummary(BaseModel):
    """Vector store list item."""

    id: str
    name: str
    description: str = ""
    provider: str
    embedding_model: str
    dimension: int
    status: str
    team_id: str | None = None
    created_at: datetime
    updated_at: datetime


class VectorStoreDetail(VectorStoreSummary):
    """Full vector store detail."""

    owner_user_id: str
    config: dict = Field(default_factory=dict)


class VectorStoreCollectionSummary(BaseModel):
    """Collection list item."""

    id: str
    vector_store_id: str
    name: str
    description: str = ""
    document_count: int = 0
    created_at: datetime
    updated_at: datetime


class VectorStoreStatsResponse(BaseModel):
    """Headline counters for the vector stores dashboard."""

    total_stores: int
    active_stores: int
    total_collections: int
    total_documents: int


class VectorStoreCreateRequest(BaseModel):
    """Request body for creating a vector store."""

    name: str = Field(..., min_length=1, max_length=128)
    description: str = ""
    provider: str = Field(..., description="pgvector | chroma | qdrant | pinecone | weaviate | memory")
    embedding_model: str = Field(...)
    dimension: int = Field(..., ge=1, le=8192)
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
            detail="Vector Stores API requires a SQL database backend.",
        )
    return sf


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


def _generate_id() -> str:
    return f"vs_{secrets.token_hex(12)}"


def _generate_collection_id() -> str:
    return f"vsc_{secrets.token_hex(12)}"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=VectorStoreStatsResponse, summary="Vector Store Stats")
@require_permission("threads", "read")
async def vector_store_stats(request: Request) -> VectorStoreStatsResponse:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        base = select(VectorStoreRow)
        if user_id:
            base = base.where(VectorStoreRow.owner_user_id == user_id)

        total_stores = (await session.scalar(select(func.count()).select_from(base.subquery()))) or 0
        active_stores = (await session.scalar(select(func.count()).select_from(base.where(VectorStoreRow.status == "active").subquery()))) or 0

        col_base = select(VectorStoreCollectionRow).join(VectorStoreRow, VectorStoreRow.id == VectorStoreCollectionRow.vector_store_id)
        if user_id:
            col_base = col_base.where(VectorStoreRow.owner_user_id == user_id)
        total_collections = (await session.scalar(select(func.coalesce(func.sum(VectorStoreCollectionRow.document_count), 0)))) or 0

        from deerflow.persistence.vector_stores.model import VectorStoreDocumentRow

        doc_base = select(VectorStoreDocumentRow).join(VectorStoreCollectionRow, VectorStoreCollectionRow.id == VectorStoreDocumentRow.collection_id).join(VectorStoreRow, VectorStoreRow.id == VectorStoreCollectionRow.vector_store_id)
        if user_id:
            doc_base = doc_base.where(VectorStoreRow.owner_user_id == user_id)
        total_documents = (await session.scalar(select(func.count()).select_from(doc_base.subquery()))) or 0

    return VectorStoreStatsResponse(
        total_stores=total_stores,
        active_stores=active_stores,
        total_collections=total_collections,
        total_documents=total_documents,
    )


@router.get("", response_model=list[VectorStoreSummary], summary="List Vector Stores")
@require_permission("threads", "read")
async def list_vector_stores(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    provider: str | None = Query(default=None, description="Filter by provider"),
    status: str | None = Query(default=None, description="Filter by status"),
) -> list[VectorStoreSummary]:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    stmt = select(VectorStoreRow).order_by(VectorStoreRow.created_at.desc()).limit(limit).offset(offset)
    if user_id:
        stmt = stmt.where(VectorStoreRow.owner_user_id == user_id)
    if provider:
        stmt = stmt.where(VectorStoreRow.provider == provider)
    if status:
        stmt = stmt.where(VectorStoreRow.status == status)

    async with sf() as session:
        rows = (await session.execute(stmt)).scalars().all()

    return [
        VectorStoreSummary(
            id=r.id,
            name=r.name,
            description=r.description,
            provider=r.provider,
            embedding_model=r.embedding_model,
            dimension=r.dimension,
            status=r.status,
            team_id=r.team_id,
            created_at=_as_utc(r.created_at) or datetime.now(UTC),
            updated_at=_as_utc(r.updated_at) or datetime.now(UTC),
        )
        for r in rows
    ]


@router.get("/{store_id}", response_model=VectorStoreDetail, summary="Get Vector Store")
@require_permission("threads", "read")
async def get_vector_store(store_id: str, request: Request) -> VectorStoreDetail:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        row = await session.get(VectorStoreRow, store_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Vector store not found")
        if user_id and row.owner_user_id != user_id:
            raise HTTPException(status_code=404, detail="Vector store not found")

    return VectorStoreDetail(
        id=row.id,
        name=row.name,
        description=row.description,
        provider=row.provider,
        embedding_model=row.embedding_model,
        dimension=row.dimension,
        status=row.status,
        owner_user_id=row.owner_user_id,
        team_id=row.team_id,
        config=row.config_json if isinstance(row.config_json, dict) else {},
        created_at=_as_utc(row.created_at) or datetime.now(UTC),
        updated_at=_as_utc(row.updated_at) or datetime.now(UTC),
    )


@router.post("", response_model=VectorStoreDetail, summary="Create Vector Store")
@require_permission("threads", "write")
async def create_vector_store(body: VectorStoreCreateRequest, request: Request) -> VectorStoreDetail:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request) or "default"

    now = datetime.now(UTC)
    row = VectorStoreRow(
        id=_generate_id(),
        name=body.name,
        description=body.description,
        owner_user_id=user_id,
        team_id=body.team_id,
        provider=body.provider,
        embedding_model=body.embedding_model,
        dimension=body.dimension,
        status="active",
        config_json=body.config,
        created_at=now,
        updated_at=now,
    )

    async with sf() as session:
        session.add(row)
        await session.commit()
        await session.refresh(row)

    return VectorStoreDetail(
        id=row.id,
        name=row.name,
        description=row.description,
        provider=row.provider,
        embedding_model=row.embedding_model,
        dimension=row.dimension,
        status=row.status,
        owner_user_id=row.owner_user_id,
        team_id=row.team_id,
        config=row.config_json if isinstance(row.config_json, dict) else {},
        created_at=_as_utc(row.created_at) or now,
        updated_at=_as_utc(row.updated_at) or now,
    )


@router.delete("/{store_id}", summary="Delete Vector Store")
@require_permission("threads", "delete")
async def delete_vector_store(store_id: str, request: Request) -> dict:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        row = await session.get(VectorStoreRow, store_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Vector store not found")
        if user_id and row.owner_user_id != user_id:
            raise HTTPException(status_code=404, detail="Vector store not found")
        await session.delete(row)
        await session.commit()

    return {"deleted": store_id}


@router.get("/{store_id}/collections", response_model=list[VectorStoreCollectionSummary], summary="List Collections")
@require_permission("threads", "read")
async def list_collections(
    store_id: str,
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[VectorStoreCollectionSummary]:
    sf = _session_factory_or_503()

    async with sf() as session:
        vs = await session.get(VectorStoreRow, store_id)
        if vs is None:
            raise HTTPException(status_code=404, detail="Vector store not found")

        stmt = select(VectorStoreCollectionRow).where(VectorStoreCollectionRow.vector_store_id == store_id).order_by(VectorStoreCollectionRow.created_at.desc()).limit(limit).offset(offset)
        rows = (await session.execute(stmt)).scalars().all()

    return [
        VectorStoreCollectionSummary(
            id=r.id,
            vector_store_id=r.vector_store_id,
            name=r.name,
            description=r.description,
            document_count=r.document_count,
            created_at=_as_utc(r.created_at) or datetime.now(UTC),
            updated_at=_as_utc(r.updated_at) or datetime.now(UTC),
        )
        for r in rows
    ]
