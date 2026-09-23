import json
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


# Plan for the "budget_cut" event: EXAMPLE with M5 (25) replaced by M4 in Saryarka (15) → cost 85 ≤ 90.
CUT_PLAN = [d.model_dump() for d in EXAMPLE[:4]] + [{"measureId": "M4", "districtId": "saryarka"}]


def test_improve_during_event_uses_event_budget_and_matches_simulate():
    payload = {"decisions": CUT_PLAN, "eventId": "budget_cut"}
    response = client.post("/api/improve", json=payload)
    assert response.status_code == 200
    body = response.json()
    simulated = client.post("/api/simulate", json=payload).json()
    assert simulated["valid"] is True and simulated["cost"] == 85
    assert body["valid"] is True
    assert body["current"]["score"] == simulated["result"]["score"]
    assert body["current"]["delta"] == simulated["result"]["delta"]
    assert body["current"]["cost"] == 85
    assert 0 <= body["percentile"] <= 100
    assert body["populationCount"] == 400145  # budget 90 leaves fewer valid plans than 694 395
    optimum = body["globalOptimum"]
    assert optimum["cost"] <= 90
    assert optimum["score"] == pytest.approx(57.188465)
    assert optimum["decisions"] == [
        {"measureId": "M3", "districtId": "nura"},
        {"measureId": "M8", "districtId": "nura"},
        {"measureId": "M9", "districtId": "nura"},
        {"measureId": "M10", "districtId": "nura"},
        {"measureId": "M14", "districtId": None},
    ]
    optimum_simulated = client.post("/api/simulate", json={"decisions": optimum["decisions"], "eventId": "budget_cut"}).json()
    assert optimum_simulated["valid"] is True and optimum_simulated["result"]["score"] == optimum["score"]
    swap = body["bestSingleSwap"]
    assert swap["plan"]["cost"] <= 90 and swap["plan"]["score"] > body["current"]["score"]
    assert (swap["remove"], swap["add"]) == ({"measureId": "M4", "districtId": "saryarka"}, {"measureId": "M14", "districtId": None})
    # The same plan without the event is compared against the base population and may use the full 100.
    assert client.post("/api/improve", json={"decisions": CUT_PLAN}).json()["bestSingleSwap"]["plan"]["cost"] == 100
    over = client.post("/api/improve", json={"decisions": [d.model_dump() for d in EXAMPLE], "eventId": "budget_cut"}).json()
    assert over["valid"] is False and over["completion"] is None
    assert "BUDGET_EXCEEDED" in {e["code"] for e in over["errors"]}
    partial = client.post("/api/improve", json={"decisions": CUT_PLAN[:2], "eventId": "budget_cut"}).json()
    assert partial["completion"]["cost"] <= 90
    assert population_stats("dataset", "budget_cut")["budget"] == 90
    assert population_stats("dataset")["count"] == 694395


@pytest.mark.parametrize("event_id", ["winter_failure", "smog", "nura_growth"])
def test_event_conditions_match_simulator(event_id):
    """The optimizer's fast formula and official solution use the post-event indicators."""
    from itertools import islice
    from app.optimizer import _solution, _valid_plans, conditions

    cond = conditions(event_id)
    simulated = client.post("/api/simulate", json={"decisions": [d.model_dump() for d in EXAMPLE], "eventId": event_id}).json()
    plan = tuple((d.measureId, d.districtId) for d in EXAMPLE)
    assert fast_score(plan, cond.base) == pytest.approx(simulated["result"]["score"], abs=1e-9)
    assert _solution(plan, cond)["score"] == simulated["result"]["score"]
    assert fast_score(plan, cond.base) != pytest.approx(fast_score(plan), abs=1e-6)
    for sample in islice(_valid_plans("dataset", budget=cond.budget), 0, 60000, 3000):
        decisions = [Decision(measureId=m, districtId=d) for m, d in sample]
        assert fast_score(sample, cond.base) == pytest.approx(simulate(decisions, cond.indicators, cond.budget)["score"], abs=1e-9)


def test_events_recalculate_budget_and_baseline(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    payload = {"decisions": [d.model_dump() for d in EXAMPLE]}
    assert client.post("/api/events/draw", json={"seed": 42}).json() == client.post("/api/events/draw", json={"seed": 42}).json()
    cut = client.post("/api/simulate", json={**payload, "eventId": "budget_cut"}).json()
    assert cut["valid"] is False
    assert cut["budget"] == 90
    assert "BUDGET_EXCEEDED" in {e["code"] for e in cut["errors"]}
    smog = client.post("/api/simulate", json={**payload, "eventId": "smog"}).json()
    assert smog["valid"] is True
    assert smog["baseline"]["criticalCount"] == 3
    assert smog["result"]["districts"][2]["beforeIndicators"]["E2"] == 34
    assert smog["result"]["criticalCount"] == 0
    assert client.post("/api/explain", json={**payload, "eventId": "smog"}).json()["status"] == "fallback_no_ai"
    assert client.post("/api/simulate", json={**payload, "eventId": "missing"}).status_code == 422
    assert client.post("/api/improve", json={**payload, "eventId": "missing"}).status_code == 422


def test_leaderboard_and_presentation(monkeypatch, tmp_path):
    import app.leaderboard as leaderboard

    monkeypatch.setattr(leaderboard, "DB_PATH", tmp_path / "scores.sqlite")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    payload = {"decisions": [d.model_dump() for d in EXAMPLE]}
    saved = client.post("/api/leaderboard", json={**payload, "teamName": "Команда А"})
    assert saved.status_code == 200
    assert saved.json()["score"] == pytest.approx(56.54307)
    entries = client.get("/api/leaderboard").json()["entries"]
    assert len(entries) == 1 and entries[0]["rank"] == 1
    assert client.post("/api/leaderboard", json={**payload, "teamName": "Команда А"}).status_code == 200
    assert len(client.get("/api/leaderboard").json()["entries"]) == 1
    assert client.post("/api/leaderboard", json={**payload, "teamName": " "}).status_code == 422
    exported = client.post("/api/presentation", json=payload).json()
    assert exported["filename"] == "akim-plan.md"
    assert "56.54" in exported["markdown"]
    assert "без AI" in exported["markdown"]


def test_synergy_scope_and_same_district_conflicts():
    transport = [Decision(measureId=m, districtId=d) for m, d in [("M1", "nura"), ("M2", None), ("M8", "nura"), ("M10", "nura"), ("M12", None)]]
    assert validate_plan(transport) == []
    assert {tuple(s["measureIds"]) for s in simulate(transport)["synergies"]} == {("M1", "M2"), ("M10", "M12")}
    ecology = [Decision(measureId=m, districtId=d) for m, d in [("M5", "nura"), ("M6", None), ("M9", "nura"), ("M10", "nura"), ("M12", None)]]
    assert validate_plan(ecology) == []
    ecology_synergy = next(s for s in simulate(ecology)["synergies"] if s["measureIds"] == ["M5", "M6"])
    assert ecology_synergy["districtId"] == "nura"
    assert ecology_synergy["indicator"] == "E2"
    different_districts = [Decision(measureId=m, districtId=d) for m, d in [("M4", "saryarka"), ("M7", "nura"), ("M8", "nura"), ("M10", "nura"), ("M12", None)]]
    assert validate_plan(different_districts) == []


def test_strict_critical_threshold_and_clipping():
    from app.simulator import BASE_INDICATORS, _metrics

    base = {key: dict(row) for key, row in BASE_INDICATORS.items()}
    base["nura"]["S1"] = 40
    base["nura"]["S2"] = 40
    assert _metrics(base)["criticalCount"] == 0
    base["nura"]["S1"] = 39.999
    assert _metrics(base)["criticalCount"] == 1
    base["nura"]["S1"] = 99
    assert simulate(EXAMPLE, base)["districts"][-1]["afterIndicators"]["S1"] == 100


def test_fast_search_score_matches_public_simulator_across_plans():
    from itertools import islice
    from app.optimizer import _valid_plans

    for plan in islice(_valid_plans("dataset"), 0, 100000, 1000):
        assert fast_score(plan) == pytest.approx(simulate([Decision(measureId=m, districtId=d) for m, d in plan])["score"], abs=1e-9)


def test_ai_structured_response_path_without_external_call(monkeypatch):
    import json
    import openai
    import app.ai as ai
    from app.facts import make_facts

    result = simulate(EXAMPLE)
    facts = make_facts(result, 95)
    answer = {"summary": "План улучшает Score.", "strengths": ["Критические значения устранены."], "risks": ["Слабым районом остаётся Нура."], "consequences": ["Эффекты проявляются в рамках условной модели."], "recommendations": ["Сравните альтернативы."], "decisions": [{"measureId": d["measureId"], "text": "Мера учтена в расчёте."} for d in result["decisions"]]}
    calls = []

    class FakeClient:
        def __init__(self, **kwargs):
            assert kwargs["api_key"] == "test-key"
            self.responses = self

        def create(self, **kwargs):
            calls.append(kwargs)
            return type("Response", (), {"output_text": json.dumps(answer, ensure_ascii=False)})()

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(openai, "OpenAI", FakeClient)
    ai._model_explain.cache_clear()
    output = ai.explain(result, facts, "dataset")
    assert output["status"] == "ai" and output["grounded"] is True
    assert calls[0]["text"]["format"]["type"] == "json_schema"
    assert ai.explain(result, facts, "dataset")["cached"] is True
    ai._model_explain.cache_clear()


def test_preview_for_unfinished_plan_and_ui_fields():
    partial = client.post("/api/simulate", json={"decisions": [{"measureId": "M7", "districtId": "nura"}]}).json()
    assert partial["valid"] is False and partial["result"] is None
    assert partial["preview"]["score"] > partial["baseline"]["score"]
    assert partial["baseline"]["minDistrictId"] == "nura"
    nura = next(d for d in partial["preview"]["districts"] if d["districtId"] == "nura")
    assert nura["criticalBefore"] == ["S1", "S2"] and nura["criticalAfter"] == ["S2"]
    over = client.post("/api/simulate", json={"decisions": [{"measureId": m, "districtId": "nura"} for m in ("M3", "M13", "M7", "M8", "M10")]}).json()
    assert [e["code"] for e in over["errors"]] == ["BUDGET_EXCEEDED"] and over["preview"] is not None
    broken = client.post("/api/simulate", json={"decisions": [{"measureId": "M7"}]}).json()
    assert broken["preview"] is None
    full = client.post("/api/simulate", json={"decisions": [d.model_dump() for d in EXAMPLE]}).json()
    assert full["preview"] == full["result"] and full["result"]["minDistrictId"]


def test_event_payload_and_draw_exclude():
    body = client.post("/api/simulate", json={"decisions": [], "eventId": "budget_cut"}).json()
    assert body["event"]["budget"] == 90 and body["budget"] == 90
    for seed in range(10):
        assert client.post("/api/events/draw", json={"seed": seed, "excludeId": "smog"}).json()["id"] != "smog"
    assert "events" in client.get("/api/catalog").json()


def test_fallback_explanation_is_rich_and_grounded(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    from app.ai import _fallback
    from app.facts import make_facts
    result = simulate(EXAMPLE)
    facts = make_facts(result, 95)
    answer = _fallback(result, facts, "test", BASELINE)
    assert answer["strengths"] and answer["risks"] and answer["recommendations"]
    assert any("синергия" in line.lower() for line in answer["strengths"])
    body = {k: answer[k] for k in ("summary", "strengths", "risks", "consequences", "recommendations", "decisions")}
    assert _grounded(body, facts, result)


def test_agent_without_key_is_honest(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    body = client.post("/api/agent", json={"decisions": [d.model_dump() for d in EXAMPLE], "goal": "подтянуть Нуру"}).json()
    assert body["status"] == "unavailable" and body["recommendation"] is None and "OPENAI_API_KEY" in body["reason"]
    assert body["groundingNote"] is None


class _Item:
    def __init__(self, **kw):
        self.__dict__.update(kw)


class _FakeResponses:
    """Scripted model: checks the plan, asks for improvements, then recommends the best swap."""

    def __init__(self):
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        example = [d.model_dump() for d in EXAMPLE]
        step = len(self.calls)
        if step == 1:
            return _Item(id="r1", output=[_Item(type="function_call", name="simulate_plan", call_id="c1", arguments=json.dumps({"decisions": example}))], output_text="")
        if step == 2:
            assert kwargs["previous_response_id"] == "r1" and kwargs["input"][0]["call_id"] == "c1"
            return _Item(id="r2", output=[_Item(type="function_call", name="find_improvements", call_id="c2", arguments=json.dumps({"decisions": example}))], output_text="")
        swapped = [d for d in example if d["measureId"] != "M5"] + [{"measureId": "M3", "districtId": "nura"}]
        answer = {"summary": "План даёт 56.54, лучшая замена поднимает Score до 57.21.", "findings": ["Нура остаётся худшим районом."], "risks": ["Линия ЛРТ реализуется медленнее."],
                  "recommendation": {"decisions": swapped, "rationale": "Замена M5 на M3 в Нуре усиливает худший район."}}
        return _Item(id="r3", output=[_Item(type="message")], output_text=json.dumps(answer, ensure_ascii=False))


def test_agent_tool_loop_with_scripted_model():
    from app.agent import run_agent
    from app.main import PlanRequest, simulation

    fake = _FakeResponses()
    result = run_agent(EXAMPLE, "подтянуть Нуру", lambda ds: simulation(PlanRequest(decisions=ds)), lambda ds: improve(ds, "dataset"), False, "test-model", client=_Item(responses=fake))
    assert result["status"] == "ai" and result["iterations"] == 3
    assert [s["tool"] for s in result["steps"]] == ["simulate_plan", "find_improvements"]
    assert result["steps"][0]["score"] == pytest.approx(56.54307)
    rec = result["recommendation"]
    assert rec["valid"] is True and rec["score"] == pytest.approx(57.21, abs=0.01)
    assert result["grounded"] is True and result["groundingNote"] is None
    fake.calls.clear()
    lying = _FakeResponses()
    original = lying.create

    def create(**kw):
        r = original(**kw)
        if r.id == "r3":
            r.output_text = r.output_text.replace("57.21", "61.5")
        return r

    lying.create = create
    lied = run_agent(EXAMPLE, None, lambda ds: simulation(PlanRequest(decisions=ds)), lambda ds: improve(ds, "dataset"), False, "m", client=_Item(responses=lying))
    assert lied["grounded"] is False
    assert lied["groundingNote"] == "В тексте агента есть числа, которых нет в результатах инструментов; опирайтесь на числа из шагов и проверенной рекомендации."
    assert "61.5" in lied["summary"]  # the model text is still returned, only marked


def test_agent_find_improvements_works_during_event():
    from app.agent import run_agent
    from app.main import PlanRequest, simulation

    class Script:
        def __init__(self):
            self.calls = []

        def create(self, **kwargs):
            self.calls.append(kwargs)
            if len(self.calls) == 1:
                return _Item(id="e1", output=[_Item(type="function_call", name="find_improvements", call_id="c1", arguments=json.dumps({"decisions": CUT_PLAN}))], output_text="")
            answer = {"summary": "Секвестр: лимит 90.", "findings": [], "risks": [], "recommendation": {"decisions": CUT_PLAN, "rationale": "План укладывается в 90."}}
            return _Item(id="e2", output=[_Item(type="message")], output_text=json.dumps(answer, ensure_ascii=False))

    script = Script()
    event = {**client.get("/api/events").json()["events"][2], "budget": 90}
    assert event["id"] == "budget_cut"
    decisions = [Decision(**d) for d in CUT_PLAN]
    result = run_agent(
        decisions, None,
        lambda ds: simulation(PlanRequest(decisions=ds, eventId="budget_cut")),
        lambda ds: improve(ds, "dataset", "budget_cut"),
        True, "m", client=_Item(responses=script), event=event,
    )
    step = result["steps"][0]
    assert step["tool"] == "find_improvements" and step["valid"] is True
    assert step["cost"] <= 90 and step["note"].startswith("в условиях события")
    tool_output = json.loads(script.calls[1]["input"][0]["output"])
    assert tool_output["validPlans"] == 400145 and tool_output["optimum"]["cost"] <= 90
    assert json.loads(script.calls[0]["input"][0]["content"])["event"]["budget"] == 90
    assert result["recommendation"]["valid"] is True and result["recommendation"]["cost"] == 85
    assert result["grounded"] is True


def _openai_error(kind, message, body):
    import httpx
    import openai

    response = httpx.Response(401 if kind == "AuthenticationError" else 404 if kind == "NotFoundError" else 400, request=httpx.Request("POST", "https://api.openai.com/v1/responses"))
    return getattr(openai, kind)(message, response=response, body=body)


def test_ai_failure_reason_is_specific_logged_and_secret_free(monkeypatch, caplog):
    import logging
    import openai
    import app.ai as ai
    from app.facts import make_facts

    secret = "sk-test-SECRET0123456789abcdef"
    errors = []

    class FailingClient:
        def __init__(self, **kwargs):
            self.responses = self

        def create(self, **kwargs):
            raise errors[0]

    monkeypatch.setenv("OPENAI_API_KEY", secret)
    monkeypatch.setattr(openai, "OpenAI", FailingClient)
    caplog.set_level(logging.WARNING, logger="akim.ai")
    result = simulate(EXAMPLE)
    facts = make_facts(result, 95)

    errors[:] = [_openai_error("NotFoundError", "Error code: 404", {"message": f"The model `{ai.MODEL}` does not exist", "code": "model_not_found"})]
    ai._model_explain.cache_clear()
    output = ai.explain(result, facts, "dataset")
    assert output["status"] == "fallback_no_ai"
    assert output["fallbackReason"] == f"OpenAI: NotFoundError — модель '{ai.MODEL}' недоступна для ключа"

    errors[:] = [_openai_error("BadRequestError", f"Error code: 400 - key {secret}", {"message": f"Unsupported parameter: 'reasoning.effort'; key {secret}"})]
    ai._model_explain.cache_clear()
    reason = ai.explain(result, facts, "dataset")["fallbackReason"]
    assert reason.startswith("OpenAI: BadRequestError — Unsupported parameter")
    assert secret not in reason and "SECRET" not in reason
    ai._model_explain.cache_clear()

    records = [r for r in caplog.records if r.name == "akim.ai"]
    assert len(records) == 2 and all(r.levelno == logging.WARNING for r in records)
    assert "NotFoundError" in records[0].getMessage()
    assert "SECRET" not in caplog.text


def test_agent_failure_reason_is_specific_logged_and_secret_free(monkeypatch, caplog):
    import logging
    from app.agent import run_agent

    secret = "sk-test-SECRET0123456789abcdef"
    monkeypatch.setenv("OPENAI_API_KEY", secret)
    caplog.set_level(logging.WARNING, logger="akim.ai")

    class Failing:
        def create(self, **kwargs):
            raise _openai_error("AuthenticationError", f"Incorrect API key provided: {secret}", {"message": f"Incorrect API key provided: {secret}", "code": "invalid_api_key"})

    result = run_agent(EXAMPLE, None, lambda ds: {}, lambda ds: {}, False, "agent-model", client=_Item(responses=Failing()))
    assert result["status"] == "error" and result["groundingNote"] is None
    assert "OpenAI: AuthenticationError — ключ OPENAI_API_KEY отклонён" in result["reason"]
    assert "SECRET" not in result["reason"] and "SECRET" not in caplog.text
    assert any(r.name == "akim.ai" and r.levelno == logging.WARNING and "AuthenticationError" in r.getMessage() for r in caplog.records)
