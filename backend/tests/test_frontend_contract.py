"""Integration invariants required by the interactive map and resilient UI."""
from fastapi.testclient import TestClient
import pytest

from app.main import app
from app.schemas import Decision
from app.simulator import BASELINE

client = TestClient(app)
EXAMPLE = [
    {"measureId": "M7", "districtId": "nura"},
    {"measureId": "M8", "districtId": "nura"},
    {"measureId": "M10", "districtId": "nura"},
    {"measureId": "M12", "districtId": None},
    {"measureId": "M5", "districtId": "saryarka"},
]


def test_draft_updates_city_without_publishing_an_official_result():
    response = client.post("/api/simulate", json={"decisions": EXAMPLE[:1]}).json()
    assert response["valid"] is False
    assert response["result"] is None
    assert response["preview"]["minDistrictId"] == "nura"
    nura = next(d for d in response["preview"]["districts"] if d["districtId"] == "nura")
    assert nura["beforeIndicators"]["S1"] == 38
    assert nura["afterIndicators"]["S1"] == 48
    assert nura["criticalBefore"] == ["S1", "S2"]
    assert nura["criticalAfter"] == ["S2"]
    assert client.post("/api/explain", json={"decisions": EXAMPLE[:1]}).status_code == 422
    assert client.post("/api/leaderboard", json={"decisions": EXAMPLE[:1], "teamName": "Draft"}).status_code == 422


@pytest.mark.parametrize("decisions", [
    [{"measureId": "M99"}],
    [{"measureId": "M7", "districtId": "unknown"}],
    [EXAMPLE[0], EXAMPLE[0]],
    [{"measureId": "M2", "districtId": "nura"}],
    [{"measureId": "M1", "districtId": "nura"}, {"measureId": "M3", "districtId": "esil"}],
    EXAMPLE + [{"measureId": "M14", "districtId": None}],
])
def test_illegal_plan_never_gets_preview(decisions):
    response = client.post("/api/simulate", json={"decisions": decisions}).json()
    assert response["valid"] is False
    assert response["result"] is None
    assert response["preview"] is None


def test_empty_draft_has_unchanged_city_and_no_official_score():
    response = client.post("/api/simulate", json={"decisions": []}).json()
    assert response["preview"]["score"] == BASELINE["score"]
    assert response["baseline"]["minDistrictId"] == "nura"
    assert response["result"] is None


def test_complete_plan_and_event_have_consistent_view_models():
    response = client.post("/api/simulate", json={"decisions": EXAMPLE, "eventId": "smog"}).json()
    assert response["valid"] is True
    assert response["preview"] is None
    assert response["event"]["id"] == "smog"
    saryarka = next(d for d in response["result"]["districts"] if d["districtId"] == "saryarka")
    assert saryarka["criticalBefore"] == ["E2"]
    assert saryarka["criticalAfter"] == []
    assert response["result"]["minDistrictId"] == "nura"


def test_event_draw_excludes_current_event():
    for seed in range(20):
        event = client.post("/api/events/draw", json={"seed": seed, "excludeId": "smog"})
        assert event.status_code == 200
        assert event.json()["id"] != "smog"
    assert client.post("/api/events/draw", json={"excludeId": "unknown"}).status_code == 422
    catalog = client.get("/api/catalog").json()
    assert {e["id"] for e in catalog["events"]} == {"winter_failure", "smog", "budget_cut", "nura_growth"}


def test_ruleset_incomplete_preview_and_complete_rejection(monkeypatch):
    import app.main as main
    monkeypatch.setattr(main, "RULESET", "all_directions")
    draft = client.post("/api/simulate", json={"decisions": EXAMPLE[:2]}).json()
    assert draft["preview"] is not None and draft["result"] is None
    complete = client.post("/api/simulate", json={"decisions": EXAMPLE}).json()
    assert complete["preview"] is None and complete["result"] is None


def test_duplicate_submission_is_canonical_and_separate_teams_are_independent(monkeypatch, tmp_path):
    import app.leaderboard as leaderboard
    monkeypatch.setattr(leaderboard, "DB_PATH", tmp_path / "scores.sqlite")
    first = client.post("/api/leaderboard", json={"teamName": "  Команда  А ", "decisions": EXAMPLE}).json()
    second = client.post("/api/leaderboard", json={"teamName": "Команда А", "decisions": list(reversed(EXAMPLE))}).json()
    assert first == second
    assert first["updatedAt"].endswith("Z")
    client.post("/api/leaderboard", json={"teamName": "Команда Б", "decisions": EXAMPLE})
    rows = client.get("/api/leaderboard").json()["entries"]
    assert len(rows) == 2
    assert {row["teamName"] for row in rows} == {"Команда А", "Команда Б"}


def test_event_cannot_enter_comparable_ranking_or_optimizer():
    payload = {"decisions": EXAMPLE, "eventId": "smog"}
    assert client.post("/api/leaderboard", json={**payload, "teamName": "Event"}).status_code == 422
    assert client.post("/api/improve", json=payload).status_code == 422

