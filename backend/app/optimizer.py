"""Exhaustive, reproducible search over every valid five-decision plan."""
from __future__ import annotations

import hashlib
import itertools
import json
import os
import tempfile
from bisect import bisect_left
from functools import lru_cache
from pathlib import Path
from threading import Lock

from .data_loader import DISTRICTS, MEASURES, MEASURE_BY_ID, RULES
from .schemas import Decision
from .simulator import simulate
from .validator import validate_plan

DISTRICT_IDS = tuple(d["id"] for d in DISTRICTS)
INDICATOR_IDS = tuple(RULES["indicatorWeights"])
IND_INDEX = {name: i for i, name in enumerate(INDICATOR_IDS)}
BASE = tuple(district["indicators"][indicator] for district in DISTRICTS for indicator in INDICATOR_IDS)
WEIGHTS = tuple(RULES["indicatorWeights"].values())
POP = tuple(d["populationShare"] for d in DISTRICTS)
IDS = tuple(m["id"] for m in MEASURES)
DATA_HASH = hashlib.sha256(json.dumps((DISTRICTS, MEASURES, RULES), ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache"
_SEARCH_LOCK = Lock()


def _effects():
    lookup = {}
    for measure in MEASURES:
        share = (RULES["horizonQuarters"] - measure["lag"]) / RULES["horizonQuarters"]
        districts = DISTRICT_IDS if measure["scope"] == "district" else (None,)
        for district_id in districts:
            rows = (DISTRICT_IDS.index(district_id),) if district_id is not None else range(len(DISTRICT_IDS))
            lookup[(measure["id"], district_id)] = tuple((r * len(INDICATOR_IDS) + IND_INDEX[k], v * share) for r in rows for k, v in measure["effects"].items())
    return lookup


EFFECTS = _effects()


def fast_score(plan: tuple[tuple[str, str | None], ...]) -> float:
    """Same formula as simulator, without building UI payloads, for exhaustive search."""
    values = list(BASE)
    chosen = dict(plan)
    for item in plan:
        for index, effect in EFFECTS[item]:
            values[index] += effect
    for synergy in RULES["synergies"]:
        a, b = synergy["measureIds"]
        if a in chosen and b in chosen:
            index = DISTRICT_IDS.index(chosen[synergy["districtFrom"]]) * len(INDICATOR_IDS) + IND_INDEX[synergy["indicator"]]
            values[index] += synergy["bonus"]
    average = 0.0
    minimum = float("inf")
    critical = 0
    for row, population in enumerate(POP):
        score = 0.0
        offset = row * len(INDICATOR_IDS)
        for col, weight in enumerate(WEIGHTS):
            value = min(100.0, max(0.0, values[offset + col]))
            critical += value < 40
            score += weight * value
        average += population * score
        minimum = min(minimum, score)
    return 0.7 * average + 0.3 * minimum - critical


def _valid_plans(ruleset: str, retained: tuple[tuple[str, str | None], ...] = ()):
    retained_map = dict(retained)
    for subset in itertools.combinations(IDS, RULES["decisionCount"]):
        if not retained_map.keys() <= set(subset):
            continue
        if sum(MEASURE_BY_ID[m]["cost"] for m in subset) > RULES["budget"]:
            continue
        if "M1" in subset and "M3" in subset:
            continue
        directions = [MEASURE_BY_ID[m]["direction"] for m in subset]
        if any(directions.count(direction) > RULES["maxPerDirection"] for direction in directions):
            continue
        if ruleset == "all_directions" and len(set(directions)) != len(RULES["directionNames"]):
            continue
        choices = [(retained_map[m],) if m in retained_map else (DISTRICT_IDS if MEASURE_BY_ID[m]["scope"] == "district" else (None,)) for m in subset]
        for assigned in itertools.product(*choices):
            where = dict(zip(subset, assigned))
            if any(a in where and b in where and where[a] == where[b] for a, b in (("M4", "M7"), ("M5", "M13"))):
                continue
            yield tuple(zip(subset, assigned))


def _plan_key(score: float, plan: tuple[tuple[str, str | None], ...]):
    return (-score, sum(MEASURE_BY_ID[m]["cost"] for m, _ in plan), tuple((m, d or "") for m, d in plan))


def population_stats(ruleset: str) -> dict:
    # Concurrent first submissions share the costly exhaustive search.
    with _SEARCH_LOCK:
        return _population_stats(ruleset)


@lru_cache(maxsize=2)
def _population_stats(ruleset: str) -> dict:
    if ruleset not in {"dataset", "all_directions"}:
        raise ValueError("Unknown ruleset")
    path = CACHE_DIR / f"search-{DATA_HASH}-{ruleset}.json"
    if path.exists():
        try:
            with path.open(encoding="utf-8") as stream:
                cached = json.load(stream)
            if cached["dataHash"] == DATA_HASH and cached["count"] == len(cached["scores"]):
                return cached
        except (OSError, ValueError, KeyError):
            pass
    scores = []
    best_plan = None
    best_key = None
    for plan in _valid_plans(ruleset):
        score = fast_score(plan)
        scores.append(score)
        key = _plan_key(score, plan)
        if best_key is None or key < best_key:
            best_key, best_plan = key, plan
    scores.sort()
    output = {"dataHash": DATA_HASH, "ruleset": ruleset, "count": len(scores), "scores": scores, "bestPlan": [{"measureId": m, "districtId": d} for m, d in best_plan], "bestScore": -best_key[0]}
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    # Unique files also allow separate worker processes to populate the cache.
    descriptor, temporary = tempfile.mkstemp(prefix=path.stem, suffix=".tmp", dir=CACHE_DIR)
    tmp_path = Path(temporary)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(output, stream, ensure_ascii=False, separators=(",", ":"))
        tmp_path.replace(path)
    finally:
        tmp_path.unlink(missing_ok=True)
    return output


def _as_decisions(plan):
    return [Decision(measureId=m, districtId=d) for m, d in plan]


def _solution(plan) -> dict:
    decisions = _as_decisions(plan)
    result = simulate(decisions)
    return {"decisions": [d.model_dump() for d in decisions], "score": result["score"], "delta": result["delta"], "cost": RULES["budget"] - result["unusedBudget"], "criticalCount": result["criticalCount"]}


def _best_completion(retained: tuple[tuple[str, str | None], ...], ruleset: str):
    best_plan, best_key = None, None
    for plan in _valid_plans(ruleset, retained):
        score = fast_score(plan)
        key = _plan_key(score, plan)
        if best_key is None or key < best_key:
            best_plan, best_key = plan, key
    return _solution(best_plan) if best_plan else None


def improve(decisions: list[Decision], ruleset: str) -> dict:
    errors = validate_plan(decisions, ruleset)
    incomplete = len(decisions) < RULES["decisionCount"]
    ignorable = {"EXACTLY_FIVE_REQUIRED", "ALL_DIRECTIONS_REQUIRED"} if incomplete else set()
    blocking = [e for e in errors if e["code"] not in ignorable]
    if blocking:
        return {"valid": False, "errors": errors, "completion": None}
    if incomplete:
        retained = tuple((d.measureId, d.districtId) for d in decisions)
        return {"valid": False, "errors": errors, "completion": _best_completion(retained, ruleset)}
    if errors:
        return {"valid": False, "errors": errors, "completion": None}

    stats = population_stats(ruleset)
    current = _solution(tuple((d.measureId, d.districtId) for d in decisions))
    score = current["score"]
    percentile = 100 * bisect_left(stats["scores"], score - 1e-9) / stats["count"]
    optimal = _solution(tuple((d["measureId"], d["districtId"]) for d in stats["bestPlan"]))
    best_swap = None
    best_key = None
    original = tuple((d.measureId, d.districtId) for d in decisions)
    for index, old in enumerate(original):
        remaining = original[:index] + original[index + 1:]
        used = {m for m, _ in remaining}
        for measure in MEASURES:
            if measure["id"] in used:
                continue
            for district_id in (DISTRICT_IDS if measure["scope"] == "district" else (None,)):
                new = (measure["id"], district_id)
                if new == old:
                    continue
                candidate = _as_decisions(remaining + (new,))
                if validate_plan(candidate, ruleset):
                    continue
                plan = tuple((d.measureId, d.districtId) for d in candidate)
                new_score = fast_score(plan)
                if new_score <= score + 1e-9:
                    continue
                key = _plan_key(new_score, tuple(sorted(plan, key=lambda p: int(p[0][1:]))))
                if best_key is None or key < best_key:
                    best_key = key
                    best_swap = {"remove": {"measureId": old[0], "districtId": old[1]}, "add": {"measureId": new[0], "districtId": new[1]}, "plan": _solution(plan)}
    return {"valid": True, "errors": [], "current": current, "percentile": percentile, "populationCount": stats["count"], "globalOptimum": optimal, "gapToOptimum": optimal["score"] - score, "bestSingleSwap": best_swap}
