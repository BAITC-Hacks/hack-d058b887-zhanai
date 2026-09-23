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
