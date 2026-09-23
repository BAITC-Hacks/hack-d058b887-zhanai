"""Small fixed scenarios; effects are model assumptions, not real forecasts."""
from __future__ import annotations

import random

from .simulator import BASE_INDICATORS, _metrics

EVENTS = [
    {"id": "winter_failure", "name": "Аварийная зима", "description": "Надёжность ЖКХ в Алматы падает.", "indicatorChanges": [{"districtId": "almaty", "indicator": "C1", "delta": -8}], "budgetDelta": 0},
    {"id": "smog", "name": "Смог", "description": "Качество воздуха в Сарыарке снижается.", "indicatorChanges": [{"districtId": "saryarka", "indicator": "E2", "delta": -6}], "budgetDelta": 0},
    {"id": "budget_cut", "name": "Секвестр бюджета", "description": "Городской лимит уменьшается на 10 единиц.", "indicatorChanges": [], "budgetDelta": -10},
    {"id": "nura_growth", "name": "Рост населения Нуры", "description": "Нагрузка на школы в Нуре увеличивается.", "indicatorChanges": [{"districtId": "nura", "indicator": "S1", "delta": -5}], "budgetDelta": 0},
]
BY_ID = {event["id"]: event for event in EVENTS}


def draw(seed: int | None = None) -> dict:
    return random.Random(seed).choice(EVENTS)


def changed_baseline(event_id: str | None):
    base = {district: dict(row) for district, row in BASE_INDICATORS.items()}
    if event_id is None:
        return base, _metrics(base)
    event = BY_ID[event_id]
    for change in event["indicatorChanges"]:
        row = base[change["districtId"]]
        indicator = change["indicator"]
        row[indicator] = min(100, max(0, row[indicator] + change["delta"]))
    return base, _metrics(base)
