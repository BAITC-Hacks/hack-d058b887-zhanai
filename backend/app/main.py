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
from .facts import make_facts
from .optimizer import improve
from .schemas import PlanRequest
from .simulator import BASELINE, simulate
from .validator import validate_plan

RULESET = os.getenv("RULESET", "dataset")
if RULESET not in {"dataset", "all_directions"}:
    raise ValueError("RULESET must be 'dataset' or 'all_directions'")

app = FastAPI(title="Аким на 5 часов", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","), allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


def _baseline() -> dict:
    return {**{k: BASELINE[k] for k in ("score", "cityAverage", "minDistrictScore", "criticalCount")}, "districts": [{"districtId": d["id"], "name": d["name"], "score": BASELINE["districtScores"][d["id"]], "indicators": d["indicators"]} for d in DISTRICTS]}


@app.get("/api/health")
def health():
    return {"status": "ok", "ruleset": RULESET, "dataVersion": RULES["dataVersion"], "aiConfigured": bool(os.getenv("OPENAI_API_KEY"))}


@app.get("/api/catalog")
def catalog():
    return {"districts": DISTRICTS, "measures": MEASURES, "rules": RULES, "ruleset": RULESET, "dataVersion": RULES["dataVersion"], "baseline": _baseline(), "syntheticData": True}


@app.post("/api/simulate")
def simulation(request: PlanRequest):
    decisions = request.decisions
    errors = validate_plan(decisions, RULESET)
    known_ids = all(d.measureId in {m["id"] for m in MEASURES} for d in decisions)
    cost = sum(next(m["cost"] for m in MEASURES if m["id"] == d.measureId) for d in decisions) if known_ids else None
    result = simulate(decisions) if not errors else None
    if result is not None:
        result["facts"] = make_facts(result, cost)
    return {"valid": not errors, "errors": errors, "cost": cost, "remainingBudget": RULES["budget"] - cost if cost is not None else None, "decisionCount": len(decisions), "ruleset": RULESET, "dataVersion": RULES["dataVersion"], "baseline": _baseline(), "result": result}


@app.post("/api/explain")
def explanation(request: PlanRequest):
    calculated = simulation(request)
    if not calculated["valid"]:
        raise HTTPException(status_code=422, detail={"errors": calculated["errors"]})
    result = calculated["result"]
    return explain(result, result["facts"], RULESET)


@app.post("/api/improve")
def improvement(request: PlanRequest):
    return improve(request.decisions, RULESET)
