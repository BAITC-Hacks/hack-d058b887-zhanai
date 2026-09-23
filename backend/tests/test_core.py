from fastapi.testclient import TestClient
import pytest

from app.ai import _grounded
from app.data_loader import DISTRICTS, MEASURES, RULES
from app.main import app
from app.optimizer import fast_score, improve, population_stats
from app.schemas import Decision
from app.simulator import BASELINE, simulate
from app.validator import validate_plan


client = TestClient(app)
EXAMPLE = [Decision(measureId="M7", districtId="nura"), Decision(measureId="M8", districtId="nura"), Decision(measureId="M10", districtId="nura"), Decision(measureId="M12"), Decision(measureId="M5", districtId="saryarka")]


def test_dataset_and_baseline():
    assert (len(DISTRICTS), len(MEASURES), len(RULES["indicatorWeights"])) == (5, 14, 10)
    assert BASELINE["score"] == pytest.approx(52.55768)
    assert BASELINE["cityAverage"] == pytest.approx(56.8624)
    assert BASELINE["criticalCount"] == 2


def test_example_and_order_independence():
    assert validate_plan(EXAMPLE) == []
    first = simulate(EXAMPLE)
    second = simulate(list(reversed(EXAMPLE)))
    assert first == second
    assert first["score"] == pytest.approx(56.54307)
    assert first["delta"] == pytest.approx(3.98539)
    assert first["criticalCount"] == 0
    assert first["cityAverage"] == pytest.approx(58.0776)
    assert first["minDistrictScore"] == pytest.approx(52.9625)
    assert first["synergies"] == [{"measureIds": ["M10", "M12"], "districtId": "nura", "indicator": "B1", "bonus": 2}]


def test_cheapest_and_negative_effect():
    plan = [Decision(measureId=m, districtId=None if m == "M12" else "nura") for m in ("M9", "M11", "M10", "M12", "M4")]
    assert validate_plan(plan) == []
    assert simulate(plan)["score"] == pytest.approx(55.67, abs=0.01)
    assert simulate(plan)["districts"][-1]["afterIndicators"]["T1"] == pytest.approx(53.25)


@pytest.mark.parametrize("plan,code", [
    (EXAMPLE[:4], "EXACTLY_FIVE_REQUIRED"),
    (EXAMPLE + EXAMPLE[:1], "DUPLICATE_MEASURE"),
    ([Decision(measureId="M1", districtId="nura"), Decision(measureId="M3", districtId="esil")] + EXAMPLE[:3], "INCOMPATIBLE_MEASURES"),
    ([Decision(measureId="M4", districtId="nura"), Decision(measureId="M7", districtId="nura")] + EXAMPLE[1:4], "INCOMPATIBLE_MEASURES"),
    ([Decision(measureId="M5", districtId="nura"), Decision(measureId="M13", districtId="nura")] + EXAMPLE[:3], "INCOMPATIBLE_MEASURES"),
    ([Decision(measureId="M2", districtId="nura")] + EXAMPLE[:4], "CITY_DISTRICT_FORBIDDEN"),
    ([Decision(measureId="M8")] + EXAMPLE[:4], "DISTRICT_REQUIRED"),
    ([Decision(measureId="M3", districtId="nura"), Decision(measureId="M13", districtId="nura")] + EXAMPLE[:3], "BUDGET_EXCEEDED"),
    ([Decision(measureId="M7", districtId="nura"), Decision(measureId="M8", districtId="nura"), Decision(measureId="M9", districtId="nura")] + EXAMPLE[2:4], "DIRECTION_LIMIT"),
])
def test_rejection(plan, code):
    assert code in {error["code"] for error in validate_plan(plan)}


def test_all_directions_mode():
    assert "ALL_DIRECTIONS_REQUIRED" in {e["code"] for e in validate_plan(EXAMPLE, "all_directions")}


def test_api_simulate_catalog_and_explain_fallback(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert client.get("/api/health").json()["status"] == "ok"
    catalog = client.get("/api/catalog").json()
    assert len(catalog["measures"]) == 14
    payload = {"decisions": [d.model_dump() for d in EXAMPLE]}
    response = client.post("/api/simulate", json=payload).json()
    assert response["valid"] is True
    assert response["cost"] == 95
    assert response["result"]["score"] == pytest.approx(56.54307)
    explanation = client.post("/api/explain", json=payload).json()
    assert explanation["status"] == "fallback_no_ai"
    assert explanation["grounded"] is True
    partial = client.post("/api/simulate", json={"decisions": payload["decisions"][:2]}).json()
    assert partial["result"] is None and partial["cost"] == 44


def test_unknown_id_and_bad_body():
    response = client.post("/api/simulate", json={"decisions": [{"measureId": "M99"}]})
    assert response.json()["result"] is None
    assert response.json()["cost"] is None
    assert "UNKNOWN_MEASURE" in {e["code"] for e in response.json()["errors"]}
    assert client.post("/api/simulate", json={"decisions": [{"measureId": "M7", "cost": 0}]}).status_code == 422


def test_ai_numerical_guard():
    result = simulate(EXAMPLE)
    facts = ["Score 56.54; расход 95."]
    answer = {"summary": "Score 56.54.", "strengths": [], "risks": [], "consequences": [], "recommendations": [], "decisions": [{"measureId": d["measureId"], "text": "Мера применяется."} for d in result["decisions"]]}
    assert _grounded(answer, facts, result)
    answer["summary"] = "Score 66.54."
    assert not _grounded(answer, facts, result)


def test_optimizer_matches_reference():
    tuples = tuple((d.measureId, d.districtId) for d in EXAMPLE)
    assert fast_score(tuples) == pytest.approx(simulate(EXAMPLE)["score"])
    stats = population_stats("dataset")
    assert stats["count"] == 694395
    assert stats["bestScore"] == pytest.approx(57.236735)
    assert stats["bestPlan"] == [
        {"measureId": "M2", "districtId": None},
        {"measureId": "M3", "districtId": "nura"},
        {"measureId": "M8", "districtId": "nura"},
        {"measureId": "M9", "districtId": "nura"},
        {"measureId": "M14", "districtId": None},
    ]
    alternative = population_stats("all_directions")
    assert alternative["count"] == 68200
    assert alternative["bestScore"] == pytest.approx(56.34451)


def test_improve_and_completion():
    response = improve(EXAMPLE, "dataset")
    assert response["valid"]
    assert response["percentile"] == pytest.approx(99.9, abs=0.1)
    assert response["bestSingleSwap"]["plan"]["score"] > response["current"]["score"]
    partial = improve(EXAMPLE[:2], "dataset")
    assert not partial["valid"]
    assert partial["completion"] is not None
    assert {"measureId": "M7", "districtId": "nura"} in partial["completion"]["decisions"]
