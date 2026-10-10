"""Teams API — team, member, and resource permission management.

Provides endpoints to list/create/delete teams, manage team members
(list/invite/remove/update role), and manage team resource permissions.
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
from deerflow.persistence.teams.model import (
    TeamMemberRow,
    TeamRow,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/teams", tags=["teams"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class TeamSummary(BaseModel):
    """Team list item."""

    id: str
    name: str
    description: str = ""
    status: str
    owner_user_id: str
    member_count: int = 0
    created_at: datetime
    updated_at: datetime


class TeamDetail(TeamSummary):
    """Full team detail."""

    metadata: dict = Field(default_factory=dict)


class TeamMemberSummary(BaseModel):
    """Team member list item."""

    id: str
    team_id: str
    user_id: str
    role: str
    joined_at: datetime


class TeamStatsResponse(BaseModel):
    """Headline counters for the teams dashboard."""

    total_teams: int
    active_teams: int
    total_members: int


class TeamCreateRequest(BaseModel):
    """Request body for creating a team."""

    name: str = Field(..., min_length=1, max_length=128)
    description: str = ""
    metadata: dict = Field(default_factory=dict)


class TeamMemberCreateRequest(BaseModel):
    """Request body for inviting a team member."""

    user_id: str = Field(..., min_length=1)
    role: str = Field(default="member", description="admin | developer | viewer | member")


class TeamMemberUpdateRequest(BaseModel):
    """Request body for updating a team member's role."""

    role: str = Field(..., description="admin | developer | viewer | member")


class TeamResourcePermissionCreateRequest(BaseModel):
    """Request body for granting a resource permission."""

    resource_type: str = Field(..., description="agent | workflow | dataset | vector_store | evaluation")
    resource_id: str = Field(..., min_length=1)
    permission: str = Field(default="view", description="view | edit | admin")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _session_factory_or_503():
    sf = get_session_factory()
    if sf is None:
        raise HTTPException(
            status_code=503,
            detail="Teams API requires a SQL database backend; set database.backend to sqlite or postgres in config.yaml.",
        )
    return sf


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


def _generate_id() -> str:
    return f"tm_{secrets.token_hex(12)}"


def _generate_member_id() -> str:
    return f"tmb_{secrets.token_hex(12)}"


def _generate_perm_id() -> str:
    return f"trp_{secrets.token_hex(12)}"


# ---------------------------------------------------------------------------
# Team endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/stats",
    response_model=TeamStatsResponse,
    summary="Team Stats",
    description="Headline counters for teams and members.",
)
@require_permission("threads", "read")
async def team_stats(request: Request) -> TeamStatsResponse:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        team_base = select(TeamRow)
        if user_id:
            team_base = team_base.where(TeamRow.owner_user_id == user_id)

        total_teams = (await session.scalar(select(func.count()).select_from(team_base.subquery()))) or 0
        active_teams = (await session.scalar(select(func.count()).select_from(team_base.where(TeamRow.status == "active").subquery()))) or 0

        member_base = select(TeamMemberRow)
        if user_id:
            member_base = member_base.join(TeamRow, TeamRow.id == TeamMemberRow.team_id).where(TeamRow.owner_user_id == user_id)
        total_members = (await session.scalar(select(func.count()).select_from(member_base.subquery()))) or 0

    return TeamStatsResponse(
        total_teams=total_teams,
        active_teams=active_teams,
        total_members=total_members,
    )


@router.get(
    "",
    response_model=list[TeamSummary],
    summary="List Teams",
    description="List teams for the current user, newest first.",
)
@require_permission("threads", "read")
async def list_teams(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None, description="Filter by status"),
) -> list[TeamSummary]:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    stmt = select(TeamRow, func.count(TeamMemberRow.id).label("member_count")).outerjoin(TeamMemberRow, TeamMemberRow.team_id == TeamRow.id).group_by(TeamRow.id).order_by(TeamRow.created_at.desc()).limit(limit).offset(offset)
    if user_id:
        stmt = stmt.where(TeamRow.owner_user_id == user_id)
    if status:
        stmt = stmt.where(TeamRow.status == status)

    async with sf() as session:
        rows = (await session.execute(stmt)).all()

    return [
        TeamSummary(
            id=row.id,
            name=row.name,
            description=row.description,
            status=row.status,
            owner_user_id=row.owner_user_id,
            member_count=member_count,
            created_at=_as_utc(row.created_at) or datetime.now(UTC),
            updated_at=_as_utc(row.updated_at) or datetime.now(UTC),
        )
        for row, member_count in rows
    ]


@router.get(
    "/{team_id}",
    response_model=TeamDetail,
    summary="Get Team",
    description="Retrieve a single team by ID.",
)
@require_permission("threads", "read")
async def get_team(team_id: str, request: Request) -> TeamDetail:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        row = await session.get(TeamRow, team_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Team not found")
        if user_id and row.owner_user_id != user_id:
            raise HTTPException(status_code=404, detail="Team not found")

    return TeamDetail(
        id=row.id,
        name=row.name,
        description=row.description,
        status=row.status,
        owner_user_id=row.owner_user_id,
        metadata=row.metadata_json if isinstance(row.metadata_json, dict) else {},
        created_at=_as_utc(row.created_at) or datetime.now(UTC),
        updated_at=_as_utc(row.updated_at) or datetime.now(UTC),
    )


@router.post(
    "",
    response_model=TeamDetail,
    summary="Create Team",
    description="Create a new team.",
)
@require_permission("threads", "write")
async def create_team(body: TeamCreateRequest, request: Request) -> TeamDetail:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request) or "default"

    now = datetime.now(UTC)
    row = TeamRow(
        id=_generate_id(),
        name=body.name,
        description=body.description,
        owner_user_id=user_id,
        status="active",
        metadata_json=body.metadata,
        created_at=now,
        updated_at=now,
    )

    async with sf() as session:
        session.add(row)
        await session.commit()
        await session.refresh(row)

    return TeamDetail(
        id=row.id,
        name=row.name,
        description=row.description,
        status=row.status,
        owner_user_id=row.owner_user_id,
        metadata=row.metadata_json if isinstance(row.metadata_json, dict) else {},
        created_at=_as_utc(row.created_at) or now,
        updated_at=_as_utc(row.updated_at) or now,
    )


@router.delete(
    "/{team_id}",
    summary="Delete Team",
    description="Delete a team and all its members and permissions.",
)
@require_permission("threads", "delete")
async def delete_team(team_id: str, request: Request) -> dict:
    sf = _session_factory_or_503()
    user_id = await get_current_user(request)

    async with sf() as session:
        row = await session.get(TeamRow, team_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Team not found")
        if user_id and row.owner_user_id != user_id:
            raise HTTPException(status_code=404, detail="Team not found")
        await session.delete(row)
        await session.commit()

    return {"deleted": team_id}


# ---------------------------------------------------------------------------
# Team member endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/{team_id}/members",
    response_model=list[TeamMemberSummary],
    summary="List Team Members",
    description="List members of a team.",
)
@require_permission("threads", "read")
async def list_team_members(
    team_id: str,
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[TeamMemberSummary]:
    sf = _session_factory_or_503()

    async with sf() as session:
        team = await session.get(TeamRow, team_id)
        if team is None:
            raise HTTPException(status_code=404, detail="Team not found")

        stmt = select(TeamMemberRow).where(TeamMemberRow.team_id == team_id).order_by(TeamMemberRow.joined_at.desc()).limit(limit).offset(offset)
        rows = (await session.execute(stmt)).scalars().all()

    return [
        TeamMemberSummary(
            id=r.id,
            team_id=r.team_id,
            user_id=r.user_id,
            role=r.role,
            joined_at=_as_utc(r.joined_at) or datetime.now(UTC),
        )
        for r in rows
    ]


@router.post(
    "/{team_id}/members",
    response_model=TeamMemberSummary,
    summary="Invite Team Member",
    description="Add a member to a team.",
)
@require_permission("threads", "write")
async def add_team_member(team_id: str, body: TeamMemberCreateRequest, request: Request) -> TeamMemberSummary:
    sf = _session_factory_or_503()

    async with sf() as session:
        team = await session.get(TeamRow, team_id)
        if team is None:
            raise HTTPException(status_code=404, detail="Team not found")

        existing = await session.scalar(
            select(TeamMemberRow).where(
                TeamMemberRow.team_id == team_id,
                TeamMemberRow.user_id == body.user_id,
            )
        )
        if existing is not None:
            raise HTTPException(status_code=409, detail="Member already exists in this team")

        now = datetime.now(UTC)
        row = TeamMemberRow(
            id=_generate_member_id(),
            team_id=team_id,
            user_id=body.user_id,
            role=body.role,
            joined_at=now,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)

    return TeamMemberSummary(
        id=row.id,
        team_id=row.team_id,
        user_id=row.user_id,
        role=row.role,
        joined_at=_as_utc(row.joined_at) or now,
    )


@router.patch(
    "/{team_id}/members/{member_id}",
    response_model=TeamMemberSummary,
    summary="Update Member Role",
    description="Update a team member's role.",
)
@require_permission("threads", "write")
async def update_team_member(
    team_id: str,
    member_id: str,
    body: TeamMemberUpdateRequest,
    request: Request,
) -> TeamMemberSummary:
    sf = _session_factory_or_503()

    async with sf() as session:
        row = await session.get(TeamMemberRow, member_id)
        if row is None or row.team_id != team_id:
            raise HTTPException(status_code=404, detail="Team member not found")
        row.role = body.role
        await session.commit()
        await session.refresh(row)

    return TeamMemberSummary(
        id=row.id,
        team_id=row.team_id,
        user_id=row.user_id,
        role=row.role,
        joined_at=_as_utc(row.joined_at) or datetime.now(UTC),
    )


@router.delete(
    "/{team_id}/members/{member_id}",
    summary="Remove Team Member",
    description="Remove a member from a team.",
)
@require_permission("threads", "delete")
async def remove_team_member(team_id: str, member_id: str, request: Request) -> dict:
    sf = _session_factory_or_503()

    async with sf() as session:
        row = await session.get(TeamMemberRow, member_id)
        if row is None or row.team_id != team_id:
            raise HTTPException(status_code=404, detail="Team member not found")
        await session.delete(row)
        await session.commit()

    return {"removed": member_id}
