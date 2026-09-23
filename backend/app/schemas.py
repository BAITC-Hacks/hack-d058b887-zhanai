"""Public request schemas. All costs and numerical effects come from the server."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class Decision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    measureId: str
    districtId: str | None = None


class PlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decisions: list[Decision] = Field(default_factory=list)
    eventId: str | None = None


class EventDrawRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    seed: int | None = None


class LeaderboardRequest(PlanRequest):
    teamName: str = Field(min_length=1, max_length=40)
