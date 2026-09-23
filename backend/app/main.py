"""HTTP interface for the deterministic simulator and AI commentary."""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from .ai import explain
from .data_loader import DISTRICTS, MEASURES, RULES
from .events import BY_ID as EVENT_BY_ID, EVENTS, changed_baseline, draw
from .facts import make_facts
from .leaderboard import list_entries, save
from .optimizer import improve
from .presentation import render_brief
from .schemas import EventDrawRequest, LeaderboardRequest, PlanRequest
from .simulator import BASELINE, simulate
from .validator import validate_plan

RULESET = os.getenv("RULESET", "dataset")
if RULESET not in {"dataset", "all_directions"}:
    raise ValueError("RULESET must be 'dataset' or 'all_directions'")

app = FastAPI(title="Аким на 5 часов", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","), allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


def _baseline(metrics: dict = BASELINE, indicators: dict | None = None) -> dict:
    return {**{k: metrics[k] for k in ("score", "cityAverage", "minDistrictScore", "criticalCount")}, "minDistrictId": min(metrics["districtScores"], key=metrics["districtScores"].get), "districts": [{"districtId": d["id"], "name": d["name"], "score": metrics["districtScores"][d["id"]], "indicators": indicators[d["id"]] if indicators else d["indicators"]} for d in DISTRICTS]}


@app.get("/api/health")
def health():
    return {"status": "ok", "ruleset": RULESET, "dataVersion": RULES["dataVersion"], "aiConfigured": bool(os.getenv("OPENAI_API_KEY"))}


@app.get("/api/catalog")
def catalog():
    return {"districts": DISTRICTS, "measures": MEASURES, "rules": RULES, "ruleset": RULESET, "dataVersion": RULES["dataVersion"], "baseline": _baseline(), "events": EVENTS, "syntheticData": True}


@app.post("/api/simulate")
def simulation(request: PlanRequest):
    if request.eventId is not None and request.eventId not in EVENT_BY_ID:
        raise HTTPException(status_code=422, detail={"errors": [{"code": "UNKNOWN_EVENT", "message": "Неизвестное событие.", "measureIds": []}]})
    event = EVENT_BY_ID.get(request.eventId)
    base, base_metrics = changed_baseline(request.eventId)
    budget = RULES["budget"] + (event["budgetDelta"] if event else 0)
    decisions = request.decisions
    errors = validate_plan(decisions, RULESET, budget)
    known_ids = all(d.measureId in {m["id"] for m in MEASURES} for d in decisions)
    cost = sum(next(m["cost"] for m in MEASURES if m["id"] == d.measureId) for d in decisions) if known_ids else None
    result = simulate(decisions, base if event else None, budget) if not errors else None
    if result is not None:
        result["facts"] = make_facts(result, cost, base_metrics, budget, event)
    # An unfinished, otherwise legal plan can animate the city. Its official
    # result remains null and cannot be explained or submitted to the leaderboard.
    draft_only = {"EXACTLY_FIVE_REQUIRED", "ALL_DIRECTIONS_REQUIRED"}
    preview = None
    if len(decisions) < RULES["decisionCount"] and all(error["code"] in draft_only for error in errors):
        preview = simulate(decisions, base if event else None, budget)
        preview["facts"] = make_facts(preview, cost, base_metrics, budget, event)
    return {"valid": not errors, "errors": errors, "cost": cost, "remainingBudget": budget - cost if cost is not None else None, "budget": budget, "eventId": request.eventId, "event": event, "decisionCount": len(decisions), "ruleset": RULESET, "dataVersion": RULES["dataVersion"], "baseline": _baseline(base_metrics, base), "result": result, "preview": preview}


@app.post("/api/explain")
def explanation(request: PlanRequest):
    calculated = simulation(request)
    if not calculated["valid"]:
        raise HTTPException(status_code=422, detail={"errors": calculated["errors"]})
    result = calculated["result"]
    return explain(result, result["facts"], RULESET, calculated["baseline"])


@app.post("/api/improve")
def improvement(request: PlanRequest):
    if request.eventId is not None:
        raise HTTPException(status_code=422, detail="Поиск оптимума после события пока не поддерживается; пересчитайте изменённый план через /api/simulate.")
    return improve(request.decisions, RULESET)


@app.post("/api/events/draw")
def draw_event(request: EventDrawRequest = EventDrawRequest()):
    if request.excludeId is not None and request.excludeId not in EVENT_BY_ID:
        raise HTTPException(status_code=422, detail="Неизвестное событие.")
    return draw(request.seed, request.excludeId)


@app.get("/api/events")
def list_events():
    return {"events": EVENTS}


@app.post("/api/leaderboard")
def save_leaderboard(request: LeaderboardRequest):
    if request.eventId is not None:
        raise HTTPException(status_code=422, detail="Лидерборд сравнивает планы при одинаковых исходных условиях; событие здесь не допускается.")
    calculated = simulation(request)
    if not calculated["valid"]:
        raise HTTPException(status_code=422, detail={"errors": calculated["errors"]})
    try:
        return save(request.teamName, RULESET, [d.model_dump() for d in request.decisions], calculated["result"], calculated["cost"])
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.get("/api/leaderboard")
def leaderboard():
    return {"ruleset": RULESET, "dataVersion": RULES["dataVersion"], "entries": list_entries(RULESET)}


@app.post("/api/presentation")
def presentation(request: PlanRequest):
    calculated = simulation(request)
    if not calculated["valid"]:
        raise HTTPException(status_code=422, detail={"errors": calculated["errors"]})
    result = calculated["result"]
    commentary = explain(result, result["facts"], RULESET, calculated["baseline"])
    return {"filename": "akim-plan.md", "markdown": render_brief(calculated, commentary), "explanationStatus": commentary["status"]}
