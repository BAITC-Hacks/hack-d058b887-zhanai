"""Load and fail-fast validate the synthetic source dataset."""
from __future__ import annotations

import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def _read(name: str):
    with (DATA_DIR / name).open(encoding="utf-8") as stream:
        return json.load(stream)


DISTRICTS = _read("districts.json")
MEASURES = _read("measures.json")
RULES = _read("rules.json")
DISTRICT_BY_ID = {item["id"]: item for item in DISTRICTS}
MEASURE_BY_ID = {item["id"]: item for item in MEASURES}


def validate_data() -> None:
    assert len(DISTRICTS) == len(DISTRICT_BY_ID) == 5
    assert len(MEASURES) == len(MEASURE_BY_ID) == 14
    indicators = set(RULES["indicatorWeights"])
    assert len(indicators) == 10
    assert abs(sum(RULES["indicatorWeights"].values()) - 1) < 1e-12
    assert abs(sum(d["populationShare"] for d in DISTRICTS) - 1) < 1e-12
    assert all(set(d["indicators"]) == indicators for d in DISTRICTS)
    assert all(0 <= value <= 100 for d in DISTRICTS for value in d["indicators"].values())
    assert all(0 < m["lag"] < RULES["horizonQuarters"] for m in MEASURES)
    assert all(set(m["effects"]) <= indicators for m in MEASURES)
    assert all(m["direction"] in RULES["directionNames"] for m in MEASURES)
    assert all(m["scope"] in {"district", "city"} for m in MEASURES)
    assert all(set(rule["measureIds"]) <= set(MEASURE_BY_ID) for rule in RULES["synergies"] + RULES["incompatibilities"])


validate_data()
