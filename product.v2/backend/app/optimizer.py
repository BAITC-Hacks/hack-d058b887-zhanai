"""Exhaustive, reproducible search over every valid five-decision plan.

Every search runs under explicit conditions: the base indicators and the budget.
Without an event these are the dataset values; with an event they are the
indicators after ``events.changed_baseline`` and ``budget + budgetDelta``, so
the numbers match ``/api/simulate`` with the same ``eventId``.
"""
from __future__ import annotations

import hashlib
import itertools
import json
import os
import threading
from array import array
from bisect import bisect_left
from functools import lru_cache
from pathlib import Path
from typing import NamedTuple

from .data_loader import DISTRICTS, MEASURES, MEASURE_BY_ID, RULES
from .events import BY_ID as EVENT_BY_ID, changed_baseline
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


class Conditions(NamedTuple):
    """Starting point of a search: base indicators and budget (after an optional event)."""
    event_id: str | None
    base: tuple[float, ...]            # flat district × indicator values for fast_score
    indicators: dict | None            # the same values for simulate(); None = dataset baseline
    budget: int

    @property
    def key(self) -> str:
        """Fingerprint of the inputs, stored in the disk cache next to DATA_HASH."""
        return hashlib.sha256(json.dumps([self.base, self.budget]).encode()).hexdigest()[:16]


def conditions(event_id: str | None = None) -> Conditions:
    if event_id is None:
        return Conditions(None, BASE, None, RULES["budget"])
    if event_id not in EVENT_BY_ID:
        raise ValueError(f"Unknown event: {event_id}")
    indicators, _ = changed_baseline(event_id)
    flat = tuple(indicators[district["id"]][indicator] for district in DISTRICTS for indicator in INDICATOR_IDS)
    return Conditions(event_id, flat, indicators, RULES["budget"] + EVENT_BY_ID[event_id]["budgetDelta"])


def fast_score(plan: tuple[tuple[str, str | None], ...], base: tuple[float, ...] = BASE) -> float:
    """Same formula as simulator, without building UI payloads, for exhaustive search."""
    values = list(base)
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


def _valid_plans(ruleset: str, retained: tuple[tuple[str, str | None], ...] = (), budget: int | None = None):
    retained_map = dict(retained)
    budget = RULES["budget"] if budget is None else budget
    for subset in itertools.combinations(IDS, RULES["decisionCount"]):
        if not retained_map.keys() <= set(subset):
            continue
        if sum(MEASURE_BY_ID[m]["cost"] for m in subset) > budget:
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


def population_stats(ruleset: str, event_id: str | None = None) -> dict:
    """Sorted Score of every valid plan under the given conditions, plus the best plan.

    The first call per (ruleset, event) takes 10–20 s; the result is cached on disk
    in ``search-<DATA_HASH>-<ruleset>-<eventId|base>.json`` and in memory.
    Concurrent requests for the same conditions wait for one search instead of repeating it.
    """
    with _LOCKS_GUARD:
        lock = _LOCKS.setdefault((ruleset, event_id), threading.Lock())
    with lock:
        return _population_stats(ruleset, event_id)


_LOCKS: dict[tuple[str, str | None], threading.Lock] = {}
_LOCKS_GUARD = threading.Lock()


@lru_cache(maxsize=10)  # 2 rulesets × (base + 4 events)
def _population_stats(ruleset: str, event_id: str | None) -> dict:
    if ruleset not in {"dataset", "all_directions"}:
        raise ValueError("Unknown ruleset")
    cond = conditions(event_id)
    path = CACHE_DIR / f"search-{DATA_HASH}-{ruleset}-{event_id or 'base'}.json"
    if path.exists():
        try:
            with path.open(encoding="utf-8") as stream:
                cached = json.load(stream)
            if cached["dataHash"] == DATA_HASH and cached.get("conditionsHash") == cond.key and cached["count"] == len(cached["scores"]):
                return {**cached, "scores": array("d", cached["scores"])}
        except (OSError, ValueError, KeyError):
            pass
    scores = []
    best_plan = None
    best_key = None
    for plan in _valid_plans(ruleset, budget=cond.budget):
        score = fast_score(plan, cond.base)
        scores.append(score)
        key = _plan_key(score, plan)
        if best_key is None or key < best_key:
            best_key, best_plan = key, plan
    scores.sort()
    output = {"dataHash": DATA_HASH, "ruleset": ruleset, "eventId": event_id, "budget": cond.budget, "conditionsHash": cond.key, "count": len(scores), "scores": scores, "bestPlan": [{"measureId": m, "districtId": d} for m, d in best_plan], "bestScore": -best_key[0]}
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(f".{os.getpid()}.tmp")
    with tmp_path.open("w", encoding="utf-8") as stream:
        json.dump(output, stream, ensure_ascii=False, separators=(",", ":"))
    tmp_path.replace(path)
    # A compact array keeps several cached conditions (base + events) cheap in memory.
    return {**output, "scores": array("d", scores)}


def _as_decisions(plan):
    return [Decision(measureId=m, districtId=d) for m, d in plan]


def _solution(plan, cond: Conditions) -> dict:
    """Official numbers for a plan: the same simulate() call as /api/simulate with this event."""
    decisions = _as_decisions(plan)
    result = simulate(decisions, cond.indicators, cond.budget)
    return {"decisions": [d.model_dump() for d in decisions], "score": result["score"], "delta": result["delta"], "cost": cond.budget - result["unusedBudget"], "criticalCount": result["criticalCount"]}


def _best_completion(retained: tuple[tuple[str, str | None], ...], ruleset: str, cond: Conditions):
    best_plan, best_key = None, None
    for plan in _valid_plans(ruleset, retained, cond.budget):
        score = fast_score(plan, cond.base)
        key = _plan_key(score, plan)
        if best_key is None or key < best_key:
            best_plan, best_key = plan, key
    return _solution(best_plan, cond) if best_plan else None


def improve(decisions: list[Decision], ruleset: str, event_id: str | None = None) -> dict:
    """Percentile, global optimum and best single swap under the event's conditions (if any)."""
    cond = conditions(event_id)
    errors = validate_plan(decisions, ruleset, cond.budget)
    incomplete = len(decisions) < RULES["decisionCount"]
    ignorable = {"EXACTLY_FIVE_REQUIRED", "ALL_DIRECTIONS_REQUIRED"} if incomplete else set()
    blocking = [e for e in errors if e["code"] not in ignorable]
    if blocking:
        return {"valid": False, "errors": errors, "completion": None}
    if incomplete:
        retained = tuple((d.measureId, d.districtId) for d in decisions)
        return {"valid": False, "errors": errors, "completion": _best_completion(retained, ruleset, cond)}
    if errors:
        return {"valid": False, "errors": errors, "completion": None}

    stats = population_stats(ruleset, event_id)
    current = _solution(tuple((d.measureId, d.districtId) for d in decisions), cond)
    score = current["score"]
    percentile = 100 * bisect_left(stats["scores"], score - 1e-9) / stats["count"]
    optimal = _solution(tuple((d["measureId"], d["districtId"]) for d in stats["bestPlan"]), cond)
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
                if validate_plan(candidate, ruleset, cond.budget):
                    continue
                plan = tuple((d.measureId, d.districtId) for d in candidate)
                new_score = fast_score(plan, cond.base)
                if new_score <= score + 1e-9:
                    continue
                key = _plan_key(new_score, tuple(sorted(plan, key=lambda p: int(p[0][1:]))))
                if best_key is None or key < best_key:
                    best_key = key
                    best_swap = {"remove": {"measureId": old[0], "districtId": old[1]}, "add": {"measureId": new[0], "districtId": new[1]}, "plan": _solution(plan, cond)}
    return {"valid": True, "errors": [], "current": current, "percentile": percentile, "populationCount": stats["count"], "globalOptimum": optimal, "gapToOptimum": optimal["score"] - score, "bestSingleSwap": best_swap}
