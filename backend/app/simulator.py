"""Deterministic calculations ported from c0c6bf0:backend/reference/akim_score.py."""
from __future__ import annotations

from .data_loader import DISTRICTS, MEASURE_BY_ID, RULES
from .schemas import Decision


def _metrics(indicators: dict[str, dict[str, float]]) -> dict:
    weights = RULES["indicatorWeights"]
    scores = {d["id"]: sum(indicators[d["id"]][k] * w for k, w in weights.items()) for d in DISTRICTS}
    average = sum(d["populationShare"] * scores[d["id"]] for d in DISTRICTS)
    minimum = min(scores.values())
    critical = sum(value < 40 for row in indicators.values() for value in row.values())
    return {"score": 0.7 * average + 0.3 * minimum - critical, "cityAverage": average, "minDistrictScore": minimum, "criticalCount": critical, "districtScores": scores}


BASE_INDICATORS = {d["id"]: dict(d["indicators"]) for d in DISTRICTS}
BASELINE = _metrics(BASE_INDICATORS)


def simulate(decisions: list[Decision]) -> dict:
    """Call only for a valid, complete plan; intermediate values are never rounded."""
    indicators = {d: dict(values) for d, values in BASE_INDICATORS.items()}
    chosen = {d.measureId: d.districtId for d in decisions}
    resolved = []
    for decision in sorted(decisions, key=lambda d: int(d.measureId[1:])):
        measure = MEASURE_BY_ID[decision.measureId]
        share = (RULES["horizonQuarters"] - measure["lag"]) / RULES["horizonQuarters"]
        effects = {key: value * share for key, value in measure["effects"].items()}
        for district_id in ([decision.districtId] if measure["scope"] == "district" else indicators):
            for key, effect in effects.items():
                indicators[district_id][key] += effect
        resolved.append({"measureId": decision.measureId, "districtId": decision.districtId, "name": measure["name"], "direction": measure["direction"], "cost": measure["cost"], "lag": measure["lag"], "realizedShare": share, "realizedEffects": effects})
    applied = []
    for synergy in RULES["synergies"]:
        a, b = synergy["measureIds"]
        if a in chosen and b in chosen:
            district_id = chosen[synergy["districtFrom"]]
            indicators[district_id][synergy["indicator"]] += synergy["bonus"]
            applied.append({"measureIds": [a, b], "districtId": district_id, "indicator": synergy["indicator"], "bonus": synergy["bonus"]})
    for row in indicators.values():
        for key, value in row.items():
            row[key] = min(100.0, max(0.0, value))
    metrics = _metrics(indicators)
    districts = [{"districtId": d["id"], "name": d["name"], "beforeScore": BASELINE["districtScores"][d["id"]], "afterScore": metrics["districtScores"][d["id"]], "beforeIndicators": BASE_INDICATORS[d["id"]], "afterIndicators": indicators[d["id"]]} for d in DISTRICTS]
    cost = sum(item["cost"] for item in resolved)
    coverage = {key: sum(item["direction"] == key for item in resolved) for key in RULES["directionNames"]}
    missed = [synergy for synergy in RULES["synergies"] if sum(mid in chosen for mid in synergy["measureIds"]) == 1]
    return {"score": metrics["score"], "delta": metrics["score"] - BASELINE["score"], "cityAverage": metrics["cityAverage"], "minDistrictScore": metrics["minDistrictScore"], "criticalCount": metrics["criticalCount"], "districts": districts, "synergies": applied, "decisions": resolved, "directionCoverage": coverage, "missedSynergies": missed, "unusedBudget": RULES["budget"] - cost}
