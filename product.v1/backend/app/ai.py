"""OpenAI Responses explanation with structural/numerical guard and honest fallback."""
from __future__ import annotations

import hashlib
import json
import os
import re
from functools import lru_cache

from .data_loader import RULES
from .simulator import BASELINE

MODEL = os.getenv("AI_MODEL", "gpt-6-sol")
PROMPT_VERSION = "v1"
NUMBERS = re.compile(r"(?<![\w])[-+]?\d+(?:[.,]\d+)?")


def _numbers(value: str) -> set[float]:
    return {round(float(match.replace(",", ".")), 2) for match in NUMBERS.findall(value)}


def _fallback(result: dict, facts: list[str], reason: str, baseline: dict) -> dict:
    """Rule-based commentary built only from the calculated facts.

    Every number here is copied from the same values that produced `facts`,
    so the fallback passes the same grounding check as a model answer.
    """
    names = RULES["indicatorNames"]
    directions = RULES["directionNames"]
    districts = sorted(result["districts"], key=lambda row: row["afterScore"] - row["beforeScore"], reverse=True)
    weakest = min(result["districts"], key=lambda row: row["afterScore"])
    district_name = {row["districtId"]: row["name"] for row in result["districts"]}

    strengths = []
    for index, row in enumerate(districts[:2]):
        if row["afterScore"] - row["beforeScore"] > 1e-9:
            lead = "Сильнее всего выросла" if index == 0 else "Также заметно выросла"
            strengths.append(f"{lead} оценка района {row['name']}: {row['beforeScore']:.2f} → {row['afterScore']:.2f}.")
    for synergy in result["synergies"]:
        strengths.append(f"Меры {' и '.join(synergy['measureIds'])} работают в паре: синергия добавляет +{synergy['bonus']} к показателю «{names[synergy['indicator']]}» в районе {district_name.get(synergy['districtId'], synergy['districtId'])}.")
    if result["criticalCount"] < baseline["criticalCount"]:
        strengths.append(f"Критических значений ниже 40 стало {result['criticalCount']} вместо {baseline['criticalCount']}: план закрывает самые острые провалы.")

    risks = [f"Самый слабый район после мер — {weakest['name']} ({weakest['afterScore']:.2f}); именно он ограничивает итоговый Score через оценку худшего района."]
    slow = [d for d in result["decisions"] if d["realizedShare"] < 0.7]
    for decision in slow:
        risks.append(f"«{decision['name']}» за горизонт симуляции даёт только {decision['realizedShare']*100:.2f}% эффекта (лаг {decision['lag']} квартала).")
    for synergy in result["missedSynergies"]:
        risks.append(f"Синергия {' + '.join(synergy['measureIds'])} не использована: в плане только одна мера из пары.")
    empty = [directions[key] for key, count in result["directionCoverage"].items() if count == 0]
    if empty:
        risks.append("Не охвачены направления: " + ", ".join(empty) + " — там показатели остаются на исходном уровне.")
    if result["criticalCount"] > 0:
        risks.append(f"Остаются критические значения ниже 40: {result['criticalCount']} — каждое снижает итоговый Score.")

    consequences = [
        f"Средневзвешенная оценка города после плана: {result['cityAverage']:.2f}; оценка худшего района: {result['minDistrictScore']:.2f}.",
        f"Итоговый Score меняется на {result['delta']:+.2f} балла.",
    ]
    if result["unusedBudget"] > 0:
        consequences.append(f"В резерве остаётся {result['unusedBudget']} ед. бюджета — их можно направить на ответ неожиданному событию.")

    recommendations = []
    for synergy in result["missedSynergies"][:1]:
        recommendations.append(f"Рассмотрите пару {' + '.join(synergy['measureIds'])}: вместе они дают дополнительный эффект к показателю «{names[synergy['indicator']]}», если это помещается в бюджет.")
    recommendations.append(f"Следующие меры полезнее всего направлять в район {weakest['name']}: он ограничивает итоговый Score.")
    if slow:
        recommendations.append("Меры с длинным лагом дают эффект позже; при равной цене мера с коротким лагом сильнее меняет Score за горизонт симуляции.")
    recommendations.append("Нажмите «Улучшить план»: сервер перебором проверит все допустимые планы и предложит лучшую замену одной меры.")

    return {
        "status": "fallback_no_ai",
        "summary": "Пояснение собрано по правилам из фактов расчёта, без языковой модели. " + facts[0],
        "strengths": strengths or ["План не ухудшает ни одного показателя относительно исходного уровня."],
        "risks": risks, "consequences": consequences, "recommendations": recommendations,
        "decisions": [{"measureId": d["measureId"], "text": f"{d['name']}: реализуется {d['realizedShare']*100:.2f}% эффекта за горизонт симуляции."} for d in result["decisions"]],
        "model": None, "cached": False, "grounded": True, "fallbackReason": reason,
    }


RESPONSE_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "summary": {"type": "string"},
        "strengths": {"type": "array", "items": {"type": "string"}},
        "risks": {"type": "array", "items": {"type": "string"}},
        "consequences": {"type": "array", "items": {"type": "string"}},
        "recommendations": {"type": "array", "items": {"type": "string"}},
        "decisions": {"type": "array", "items": {"type": "object", "additionalProperties": False, "properties": {"measureId": {"type": "string"}, "text": {"type": "string"}}, "required": ["measureId", "text"]}},
    },
    "required": ["summary", "strengths", "risks", "consequences", "recommendations", "decisions"],
}


def _grounded(answer: dict, facts: list[str], result: dict) -> bool:
    if not isinstance(answer, dict) or set(answer) != set(RESPONSE_SCHEMA["required"]):
        return False
    if not isinstance(answer["summary"], str):
        return False
    for key in ("strengths", "risks", "consequences", "recommendations"):
        if not isinstance(answer[key], list) or not all(isinstance(x, str) for x in answer[key]):
            return False
    decisions = answer["decisions"]
    ids = {d["measureId"] for d in result["decisions"]}
    if not isinstance(decisions, list) or {d.get("measureId") for d in decisions if isinstance(d, dict)} != ids or len(decisions) != len(ids):
        return False
    if not all(isinstance(d, dict) and isinstance(d.get("text"), str) for d in decisions):
        return False
    allowed = _numbers(" ".join(facts))
    content = [answer["summary"]] + [x for key in ("strengths", "risks", "consequences", "recommendations") for x in answer[key]] + [d["text"] for d in decisions]
    return all(number in allowed for line in content for number in _numbers(line))


@lru_cache(maxsize=256)
def _model_explain(cache_key: str, facts_json: str) -> dict:
    from openai import OpenAI

    facts = json.loads(facts_json)
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], timeout=16.0, max_retries=0)
    response = client.responses.create(
        model=MODEL,
        input=[
            {"role": "developer", "content": "Ты советник для условной симуляции Астаны. Объясни только переданные факты по-русски. Никаких новых чисел, прогнозов, внешних сведений или нерассчитанных конкретных планов. Укажи сильные стороны, риски, последствия и осторожные рекомендации. Для каждой выбранной меры дай одну короткую фразу. Числа переписывай точно из фактов либо не используй."},
            {"role": "user", "content": json.dumps({"facts": facts}, ensure_ascii=False)},
        ],
        text={"format": {"type": "json_schema", "name": "city_plan_explanation", "strict": True, "schema": RESPONSE_SCHEMA}},
        reasoning={"effort": "low"},
        max_output_tokens=1800,
    )
    return json.loads(response.output_text)


def explain(result: dict, facts: list[str], ruleset: str, baseline: dict | None = None) -> dict:
    baseline = BASELINE if baseline is None else baseline
    if not os.getenv("OPENAI_API_KEY"):
        return _fallback(result, facts, "OPENAI_API_KEY не задан на сервере", baseline)
    facts_json = json.dumps(facts, ensure_ascii=False, sort_keys=True)
    key = hashlib.sha256((RULES["dataVersion"] + ruleset + MODEL + PROMPT_VERSION + facts_json).encode()).hexdigest()
    for attempt in range(2):
        try:
            before = _model_explain.cache_info().hits
            response = _model_explain(key + str(attempt), facts_json)
            if _grounded(response, facts, result):
                return {"status": "ai", **response, "model": MODEL, "cached": _model_explain.cache_info().hits > before, "grounded": True, "fallbackReason": None}
        except Exception:
            # The deterministic scenario must continue when a model is unavailable.
            break
    return _fallback(result, facts, "AI недоступен или ответ не прошёл проверку фактов", baseline)
