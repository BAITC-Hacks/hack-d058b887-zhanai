"""OpenAI Responses explanation with structural/numerical guard and honest fallback."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from functools import lru_cache

from .data_loader import DISTRICTS, RULES
from .simulator import BASELINE

MODEL = os.getenv("AI_MODEL", "gpt-6-sol")
PROMPT_VERSION = "v2"
NUMBERS = re.compile(r"(?<![\w])[-+]?\d+(?:[.,]\d+)?")
logger = logging.getLogger("akim.ai")

# Readable hints for typical OpenAI SDK errors (class name → what to check).
_ERROR_HINTS = {
    "NotFoundError": "модель '{model}' недоступна для ключа",
    "AuthenticationError": "ключ OPENAI_API_KEY отклонён",
    "PermissionDeniedError": "у ключа нет доступа к модели '{model}'",
    "RateLimitError": "превышен лимит запросов или исчерпана квота",
    "APITimeoutError": "модель не ответила вовремя (таймаут)",
    "APIConnectionError": "нет соединения с API OpenAI",
    "InternalServerError": "ошибка на стороне OpenAI",
    "JSONDecodeError": "ответ модели не в формате JSON",
}
_SECRET = re.compile(r"(sk-[A-Za-z0-9*_\-]{4,}|Bearer\s+\S+)")


def error_reason(error: Exception, model: str) -> str:
    """Concise, secret-free reason: "OpenAI: NotFoundError — модель 'x' недоступна для ключа".

    Known SDK errors get a fixed Russian hint; for the rest the provider message is
    cut to 160 characters with anything key-like masked. The API key never appears.
    """
    name = type(error).__name__
    hint = _ERROR_HINTS.get(name, "").format(model=model)
    if not hint:
        body = getattr(error, "body", None)
        message = body.get("message") if isinstance(body, dict) and isinstance(body.get("message"), str) else str(error)
        key = os.getenv("OPENAI_API_KEY")
        if key:
            message = message.replace(key, "***")
        hint = " ".join(_SECRET.sub("***", message).split())[:160] or "без описания"
    source = "OpenAI: " if type(error).__module__.split(".")[0] == "openai" else ""
    return f"{source}{name} — {hint}"


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

    # Вердикт одной фразой; каждое число здесь есть в facts (Score, критические, районы).
    if result["delta"] >= 0.005:
        summary = f"Score вырос с {baseline['score']:.2f} до {result['score']:.2f} ({result['delta']:+.2f})"
    elif result["delta"] <= -0.005:
        summary = f"Score снизился с {baseline['score']:.2f} до {result['score']:.2f} ({result['delta']:+.2f})"
    else:
        summary = f"Score почти не изменился ({result['score']:.2f})"
    if result["criticalCount"] < baseline["criticalCount"]:
        summary += f": критических значений стало {result['criticalCount']} вместо {baseline['criticalCount']}"
    elif result["criticalCount"] > 0:
        summary += f", но критических значений осталось {result['criticalCount']}"
    summary += f"; худший район — {weakest['name']} ({weakest['afterScore']:.2f})."

    return {
        "status": "fallback_no_ai",
        "summary": summary,
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


_GLOSSARY = (
    "показатели — " + "; ".join(f"{key}: {name}" for key, name in RULES["indicatorNames"].items())
    + ". Районы — " + "; ".join(f"{row['id']}: {row['name']}" for row in DISTRICTS) + "."
)

DEVELOPER_PROMPT = f"""Ты — советник акима в учебной симуляции управления Астаной; данные условные. В facts — посчитанные симулятором факты о плане. Разбери план по-русски, опираясь только на них.

Что написать (строго по JSON-схеме):
- summary — ОДНА фраза-вердикт, не длиннее 20 слов: итог плана и главный компромисс — что выиграли и чем заплатили. Образец формы: «Сильный план: критические провалы закрыты, но транспорт не тронут и бюджет почти исчерпан.»
- strengths — 2–3 коротких пункта: что план реально улучшил, с конкретным районом, показателем и числом.
- risks — 2–3 пункта: что осталось слабым или сработает не полностью (худший район, долгий лаг, неохваченное направление, упущенная синергия, оставшиеся критические значения).
- consequences — 2–3 пункта: что это значит для города в целом — средняя оценка, разрыв между районами, резерв бюджета.
- recommendations — 1–2 конкретных действия: какую меру добавить, заменить или перенести и в какой район. Только меры и районы из фактов; не обещай итоговый Score — он не рассчитан.
- decisions — ровно один объект на каждую меру из фактов, measureId как в фактах; text — одна фраза: что мера даёт и где.

Стиль:
- Один пункт — одна мысль, до 20 слов. Не повторяй одно и то же в разных разделах и не пересказывай summary.
- Пиши просто и конкретно, без канцелярита и пустых оборотов. Плохо: «во всех перечисленных районах», «данный план», «в рамках модели», «оказывает положительное влияние». Хорошо: «Нура выросла сильнее всех районов», «транспорт не охвачен: пробки остаются на исходном уровне».
- Меры называй словами, а не кодом (не «M7», а «модульная школа и детсад»). Показатели и районы тоже словами, по словарю ниже, без кодов.

Числа:
- Только числа из фактов, записанные точно так же, как в фактах (с десятичной точкой). Не округляй, не складывай, не считай разницы и проценты. Нужного числа в фактах нет — пиши без числа.
- Никаких внешних сведений, прогнозов, денег и сроков, которых нет в фактах.

Словарь кодов: {_GLOSSARY}"""


@lru_cache(maxsize=256)
def _model_explain(cache_key: str, facts_json: str) -> dict:
    from openai import OpenAI

    facts = json.loads(facts_json)
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], timeout=16.0, max_retries=0)
    response = client.responses.create(
        model=MODEL,
        input=[
            {"role": "developer", "content": DEVELOPER_PROMPT},
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
    reason = "ответ модели не прошёл проверку фактов (структура или числа)"
    for attempt in range(2):
        try:
            before = _model_explain.cache_info().hits
            response = _model_explain(key + str(attempt), facts_json)
            if _grounded(response, facts, result):
                return {"status": "ai", **response, "model": MODEL, "cached": _model_explain.cache_info().hits > before, "grounded": True, "fallbackReason": None}
        except Exception as error:
            # The deterministic scenario must continue when a model is unavailable.
            reason = error_reason(error, MODEL)
            break
    logger.warning("AI-объяснение: шаблон вместо модели %s: %s", MODEL, reason)
    return _fallback(result, facts, reason, baseline)
