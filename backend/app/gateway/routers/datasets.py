"""Datasets API — data asset CRUD and version management.

Provides endpoints to list, create, retrieve, delete datasets,
list versions, and list items within a dataset version.
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
from deerflow.persistence.datasets.model import (
    DatasetItemRow,
    DatasetRow,
    DatasetVersionRow,
)
from deerflow.persistence.engine import get_session_factory

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/datasets", tags=["datasets"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class DatasetSummary(BaseModel):
    """Dataset list item."""

    id: str
    name: str
    description: str = ""
    dataset_type: str
    format: str
    current_version: int = 1
    item_count: int = 0
    team_id: str | None = None
    tags: list = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class DatasetDetail(DatasetSummary):
    """Full dataset detail."""

    owner_user_id: str
    metadata: dict = Field(default_factory=dict)


class DatasetVersionSummary(BaseModel):
    """Dataset version list item."""

    id: str
    dataset_id: str
    version: int
    name: str | None = None
    item_count: int = 0
    size_bytes: int = 0
    created_by: str | None = None
    created_at: datetime


class DatasetItemSummary(BaseModel):
    """A single item in a dataset version."""

    id: str
    item_index: int
    content: dict = Field(default_factory=dict)
    metadata: dict = Field(default_factory=dict)
    created_at: datetime


class DatasetStatsResponse(BaseModel):
    """Headline counters for the datasets dashboard."""

    total_datasets: int
    total_items: int
    training_datasets: int
    evaluation_datasets: int
    knowledge_datasets: int


class DatasetCreateRequest(BaseModel):
    """Request body for creating a dataset."""

    name: str = Field(..., min_length=1, max_length=128)
    description: str = ""
    dataset_type: str = Field(default="general", description="general | training | evaluation | knowledge")
    format: str = Field(default="json", description="json | jsonl | csv | parquet")
    team_id: str | None = None
    tags: list = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _session_factory_or_503():
    sf = get_session_factory()
    if sf is None:
        raise HTTPException(
            status_code=503,
            detail="Datasets API requires a SQL database backend.",
        )
    return sf


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


def _generate_id() -> str:
    return f"ds_{secrets.token_hex(12)}"


def _generate_version_id() -> str:
    return f"dsv_{secrets.token_hex(12)}"


def _generate_item_id() -> str:
    return f"dsi_{secrets.token_hex(12)}"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=DatasetStatsResponse, summary="Dataset Stats")
@require_permission("threads", "read")
async def dataset_stats(request: Request) -> DatasetStatsResponse:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        base = select(DatasetRow)
        if user_id:
            base = base.where(DatasetRow.owner_user_id == user_id)

        total = (await session.scalar(select(func.count()).select_from(base.subquery()))) or 0
        training = (await session.scalar(select(func.count()).select_from(base.where(DatasetRow.dataset_type == "training").subquery()))) or 0
        evaluation = (await session.scalar(select(func.count()).select_from(base.where(DatasetRow.dataset_type == "evaluation").subquery()))) or 0
        knowledge = (await session.scalar(select(func.count()).select_from(base.where(DatasetRow.dataset_type == "knowledge").subquery()))) or 0

        items_base = select(DatasetItemRow)
        if user_id:
            items_base = items_base.where(DatasetItemRow.dataset_id.in_(select(DatasetRow.id).where(DatasetRow.owner_user_id == user_id)))
        total_items = (await session.scalar(select(func.count()).select_from(items_base.subquery()))) or 0

    return DatasetStatsResponse(
        total_datasets=total,
        total_items=total_items,
        training_datasets=training,
        evaluation_datasets=evaluation,
        knowledge_datasets=knowledge,
    )


@router.get("", response_model=list[DatasetSummary], summary="List Datasets")
@require_permission("threads", "read")
async def list_datasets(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    dataset_type: str | None = Query(default=None, description="Filter by type"),
) -> list[DatasetSummary]:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    stmt = select(DatasetRow).order_by(DatasetRow.created_at.desc()).limit(limit).offset(offset)
    if user_id:
        stmt = stmt.where(DatasetRow.owner_user_id == user_id)
    if dataset_type:
        stmt = stmt.where(DatasetRow.dataset_type == dataset_type)

    async with sf() as session:
        rows = (await session.execute(stmt)).scalars().all()

    return [
        DatasetSummary(
            id=r.id,
            name=r.name,
            description=r.description,
            dataset_type=r.dataset_type,
            format=r.format,
            current_version=r.current_version,
            item_count=r.item_count,
            team_id=r.team_id,
            tags=r.tags_json if isinstance(r.tags_json, list) else [],
            created_at=_as_utc(r.created_at) or datetime.now(UTC),
            updated_at=_as_utc(r.updated_at) or datetime.now(UTC),
        )
        for r in rows
    ]


@router.get("/{dataset_id}", response_model=DatasetDetail, summary="Get Dataset")
@require_permission("threads", "read")
async def get_dataset(dataset_id: str, request: Request) -> DatasetDetail:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        row = await session.get(DatasetRow, dataset_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Dataset not found")
        if user_id and row.owner_user_id != user_id:
            raise HTTPException(status_code=404, detail="Dataset not found")

    return DatasetDetail(
        id=row.id,
        name=row.name,
        description=row.description,
        dataset_type=row.dataset_type,
        format=row.format,
        current_version=row.current_version,
        item_count=row.item_count,
        owner_user_id=row.owner_user_id,
        team_id=row.team_id,
        tags=row.tags_json if isinstance(row.tags_json, list) else [],
        metadata=row.metadata_json if isinstance(row.metadata_json, dict) else {},
        created_at=_as_utc(row.created_at) or datetime.now(UTC),
        updated_at=_as_utc(row.updated_at) or datetime.now(UTC),
    )


@router.post("", response_model=DatasetDetail, summary="Create Dataset")
@require_permission("threads", "write")
async def create_dataset(body: DatasetCreateRequest, request: Request) -> DatasetDetail:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request) or "default"

    now = datetime.now(UTC)
    row = DatasetRow(
        id=_generate_id(),
        name=body.name,
        description=body.description,
        owner_user_id=user_id,
        team_id=body.team_id,
        dataset_type=body.dataset_type,
        format=body.format,
        current_version=1,
        item_count=0,
        tags_json=body.tags,
        metadata_json=body.metadata,
        created_at=now,
        updated_at=now,
    )

    async with sf() as session:
        session.add(row)
        await session.commit()
        await session.refresh(row)

    return DatasetDetail(
        id=row.id,
        name=row.name,
        description=row.description,
        dataset_type=row.dataset_type,
        format=row.format,
        current_version=row.current_version,
        item_count=row.item_count,
        owner_user_id=row.owner_user_id,
        team_id=row.team_id,
        tags=row.tags_json if isinstance(row.tags_json, list) else [],
        metadata=row.metadata_json if isinstance(row.metadata_json, dict) else {},
        created_at=_as_utc(row.created_at) or now,
        updated_at=_as_utc(row.updated_at) or now,
    )


@router.delete("/{dataset_id}", summary="Delete Dataset")
@require_permission("threads", "delete")
async def delete_dataset(dataset_id: str, request: Request) -> dict:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        row = await session.get(DatasetRow, dataset_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Dataset not found")
        if user_id and row.owner_user_id != user_id:
            raise HTTPException(status_code=404, detail="Dataset not found")
        await session.delete(row)
        await session.commit()

    return {"deleted": dataset_id}


@router.get("/{dataset_id}/versions", response_model=list[DatasetVersionSummary], summary="List Dataset Versions")
@require_permission("threads", "read")
async def list_dataset_versions(
    dataset_id: str,
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[DatasetVersionSummary]:
    sf = _session_factory_or_503()

    async with sf() as session:
        ds = await session.get(DatasetRow, dataset_id)
        if ds is None:
            raise HTTPException(status_code=404, detail="Dataset not found")

        stmt = select(DatasetVersionRow).where(DatasetVersionRow.dataset_id == dataset_id).order_by(DatasetVersionRow.version.desc()).limit(limit).offset(offset)
        rows = (await session.execute(stmt)).scalars().all()

    return [
        DatasetVersionSummary(
            id=r.id,
            dataset_id=r.dataset_id,
            version=r.version,
            name=r.name,
            item_count=r.item_count,
            size_bytes=r.size_bytes,
            created_by=r.created_by,
            created_at=_as_utc(r.created_at) or datetime.now(UTC),
        )
        for r in rows
    ]


@router.get("/{dataset_id}/versions/{version_id}/items", response_model=list[DatasetItemSummary], summary="List Dataset Items")
@require_permission("threads", "read")
async def list_dataset_items(
    dataset_id: str,
    version_id: str,
    request: Request,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> list[DatasetItemSummary]:
    sf = _session_factory_or_503()

    async with sf() as session:
        ds = await session.get(DatasetRow, dataset_id)
        if ds is None:
            raise HTTPException(status_code=404, detail="Dataset not found")

        stmt = select(DatasetItemRow).where(DatasetItemRow.version_id == version_id).order_by(DatasetItemRow.item_index).limit(limit).offset(offset)
        rows = (await session.execute(stmt)).scalars().all()

    return [
        DatasetItemSummary(
            id=r.id,
            item_index=r.item_index,
            content=r.content_json if isinstance(r.content_json, dict) else {},
            metadata=r.metadata_json if isinstance(r.metadata_json, dict) else {},
            created_at=_as_utc(r.created_at) or datetime.now(UTC),
        )
        for r in rows
    ]
