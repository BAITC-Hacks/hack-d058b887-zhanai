"""HTTP interface for the deterministic simulator and AI commentary.

The server is the single source of truth: it validates every plan, recalculates
cost and Score, and only then lets the AI comment on already computed facts.
If a built frontend exists (frontend/dist), it is served from the same port,
so the whole product runs as one process.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

PRODUCT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PRODUCT_ROOT / ".env")

from .ai import MODEL, explain  # noqa: E402  (env must be loaded first)
from .data_loader import DISTRICTS, MEASURE_BY_ID, MEASURES, RULES  # noqa: E402
from .events import BY_ID as EVENT_BY_ID, EVENTS, changed_baseline, draw  # noqa: E402
from .facts import make_facts  # noqa: E402
from .leaderboard import list_entries, save  # noqa: E402
from .optimizer import improve  # noqa: E402
from .presentation import render_brief  # noqa: E402
from .schemas import EventDrawRequest, LeaderboardRequest, PlanRequest  # noqa: E402
from .simulator import BASELINE, simulate  # noqa: E402
from .validator import validate_plan  # noqa: E402

RULESET = os.getenv("RULESET", "dataset")
if RULESET not in {"dataset", "all_directions"}:
    raise ValueError("RULESET must be 'dataset' or 'all_directions'")

# Errors after which a partial calculation is impossible (unknown IDs, missing district).
STRUCTURAL_ERRORS = {"UNKNOWN_MEASURE", "DISTRICT_REQUIRED", "CITY_DISTRICT_FORBIDDEN"}

app = FastAPI(title="Аким на 5 часов", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","), allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


def _baseline(metrics: dict = BASELINE, indicators: dict | None = None) -> dict:
    return {
        **{k: metrics[k] for k in ("score", "cityAverage", "minDistrictScore", "minDistrictId", "criticalCount")},
        "districts": [{"districtId": d["id"], "name": d["name"], "score": metrics["districtScores"][d["id"]], "indicators": indicators[d["id"]] if indicators else d["indicators"]} for d in DISTRICTS],
    }


def _event_payload(event: dict | None, budget: int) -> dict | None:
    return None if event is None else {**event, "budget": budget}


def _preview(decisions, errors, base, budget):
    """What-if calculation for an unfinished or invalid plan.

    It never replaces `result`: the official Score exists only for a valid plan.
    The preview lets the interface show the consequence of every single step.
    """
    if not decisions or any(e["code"] in STRUCTURAL_ERRORS for e in errors):
        return None
    usable = [d for d in decisions if d.measureId in MEASURE_BY_ID]
    unique = list({d.measureId: d for d in usable}.values())
    return simulate(unique, base, budget)


@app.get("/api/health")
def health():
    return {"status": "ok", "ruleset": RULESET, "dataVersion": RULES["dataVersion"], "aiConfigured": bool(os.getenv("OPENAI_API_KEY")), "aiModel": MODEL}


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
    known_ids = all(d.measureId in MEASURE_BY_ID for d in decisions)
    cost = sum(MEASURE_BY_ID[d.measureId]["cost"] for d in decisions) if known_ids else None
    result = simulate(decisions, base if event else None, budget) if not errors else None
    if result is not None:
        result["facts"] = make_facts(result, cost, base_metrics, budget, event)
    preview = result if result is not None else _preview(decisions, errors, base, budget)
    return {
        "valid": not errors, "errors": errors, "cost": cost,
        "remainingBudget": budget - cost if cost is not None else None, "budget": budget,
        "eventId": request.eventId, "event": _event_payload(event, budget),
        "decisionCount": len(decisions), "ruleset": RULESET, "dataVersion": RULES["dataVersion"],
        "baseline": _baseline(base_metrics, base), "result": result, "preview": preview,
    }


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
    event = draw(request.seed, request.excludeId)
    return _event_payload(event, RULES["budget"] + event["budgetDelta"])


@app.get("/api/events")
def list_events():
    return {"events": EVENTS}


@app.post("/api/leaderboard")
def save_leaderboard(request: LeaderboardRequest):
    if request.eventId is not None:
        raise HTTPException(status_code=422, detail="Лидерборд сравнивает планы при одинаковых исходных условиях; сбросьте событие перед записью.")
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


# ---- Built frontend on the same port (production / demo mode) ---------------
FRONTEND_DIST = Path(os.getenv("FRONTEND_DIST", PRODUCT_ROOT / "frontend" / "dist"))

if (FRONTEND_DIST / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        file = (FRONTEND_DIST / path).resolve()
        if path and file.is_file() and FRONTEND_DIST.resolve() in file.parents:
            return FileResponse(file)
        return FileResponse(FRONTEND_DIST / "index.html")
