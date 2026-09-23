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
    weakest = min(result["districts"], key=lambda row: row["afterScore"])
    return {
        "status": "fallback_no_ai", "summary": "Пояснение сформировано по правилам без AI. " + facts[0],
        "strengths": [f"Критических показателей стало {result['criticalCount']} вместо {baseline['criticalCount']}."],
        "risks": [f"Самый слабый район после мер — {weakest['name']} ({weakest['afterScore']:.2f})."],
        "consequences": [f"Средневзвешенная оценка города: {result['cityAverage']:.2f}."],
        "recommendations": ["Сравните план с допустимой альтернативой через функцию улучшения; это модельная, а не реальная оценка."],
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
