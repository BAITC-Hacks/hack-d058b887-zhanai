"""Pure plan validation; never calculates a Score for an invalid plan."""
from __future__ import annotations

from collections import Counter

from .data_loader import DISTRICT_BY_ID, MEASURE_BY_ID, RULES
from .schemas import Decision


def validate_plan(decisions: list[Decision], ruleset: str = "dataset", budget: int | None = None) -> list[dict]:
    errors: list[dict] = []

    def add(code: str, message: str, ids: list[str] | None = None):
        errors.append({"code": code, "message": message, "measureIds": ids or []})

    ids = [d.measureId for d in decisions]
    unknown = sorted(set(ids) - set(MEASURE_BY_ID))
    if unknown:
        add("UNKNOWN_MEASURE", f"Неизвестные мероприятия: {', '.join(unknown)}", unknown)
    if len(decisions) != RULES["decisionCount"]:
        add("EXACTLY_FIVE_REQUIRED", f"Нужно выбрать ровно {RULES['decisionCount']} мероприятий; выбрано {len(decisions)}.")
    duplicates = sorted(m for m, count in Counter(ids).items() if count > 1)
    if duplicates:
        add("DUPLICATE_MEASURE", f"Мероприятия повторяются: {', '.join(duplicates)}", duplicates)
    if unknown:
        return errors

    cost = sum(MEASURE_BY_ID[m]["cost"] for m in ids)
    active_budget = RULES["budget"] if budget is None else budget
    if cost > active_budget:
        add("BUDGET_EXCEEDED", f"Бюджет превышен: {cost} > {active_budget}.", ids)
    for decision in decisions:
        measure = MEASURE_BY_ID[decision.measureId]
        if measure["scope"] == "district" and decision.districtId not in DISTRICT_BY_ID:
            add("DISTRICT_REQUIRED", f"Для {decision.measureId} укажите существующий район.", [decision.measureId])
        if measure["scope"] == "city" and decision.districtId is not None:
            add("CITY_DISTRICT_FORBIDDEN", f"Для {decision.measureId} район не указывается.", [decision.measureId])
    counts = Counter(MEASURE_BY_ID[m]["direction"] for m in ids)
    for direction, count in counts.items():
        if count > RULES["maxPerDirection"]:
            add("DIRECTION_LIMIT", f"Из направления «{RULES['directionNames'][direction]}» можно выбрать не более двух мероприятий.", [m for m in ids if MEASURE_BY_ID[m]["direction"] == direction])
    if ruleset == "all_directions" and set(counts) != set(RULES["directionNames"]):
        add("ALL_DIRECTIONS_REQUIRED", "В этом режиме нужно выбрать по одному мероприятию из каждого направления.")
    by_id = {d.measureId: d.districtId for d in decisions}
    for rule in RULES["incompatibilities"]:
        a, b = rule["measureIds"]
        if a in by_id and b in by_id and (rule["scope"] == "any" or by_id[a] == by_id[b]):
            add("INCOMPATIBLE_MEASURES", f"{a} и {b} несовместимы" + (" в одном районе." if rule["scope"] == "same_district" else "."), [a, b])
    return errors
