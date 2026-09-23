"""Tool-using AI advisor: the model plans, the simulator answers.

The agent never computes numbers itself. It calls two server tools:

* ``simulate_plan``      — the deterministic simulator (validator + Score);
* ``find_improvements``  — exhaustive search: percentile, optimum, best swap.

It may test several hypotheses, then returns a structured answer with one
recommended plan. The server re-simulates that plan and checks that every
number in the model's text appeared in some tool result (grounding guard).
Without OPENAI_API_KEY the endpoint answers honestly with ``unavailable``.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Callable

from .data_loader import DISTRICTS, MEASURES, RULES
from .schemas import Decision

MAX_TOOL_CALLS = int(os.getenv("AGENT_MAX_TOOL_CALLS", "8"))
NUMBERS = re.compile(r"(?<![\w])[-+]?\d+(?:[.,]\d+)?")

DECISIONS_SCHEMA = {
    "type": "array",
    "description": "Набор мер. Для районной меры districtId — один из esil, almaty, saryarka, baikonur, nura; для городской — null.",
    "items": {
        "type": "object", "additionalProperties": False,
        "properties": {"measureId": {"type": "string"}, "districtId": {"type": ["string", "null"]}},
        "required": ["measureId", "districtId"],
    },
}

TOOLS = [
    {
        "type": "function", "name": "simulate_plan", "strict": True,
        "description": "Проверить план в симуляторе: допустимость (бюджет, 5 мер, лимиты, несовместимости), стоимость, Score, изменение, критические показатели, худший район, синергии. Для неполного плана возвращает предварительный расчёт.",
        "parameters": {"type": "object", "additionalProperties": False, "properties": {"decisions": DECISIONS_SCHEMA}, "required": ["decisions"]},
    },
    {
        "type": "function", "name": "find_improvements", "strict": True,
        "description": "Полный перебор всех допустимых планов: процентиль текущего плана, глобальный оптимум и лучшая замена одной меры. Для неполного плана — лучшее дополнение до пяти мер. Не работает при активном событии.",
        "parameters": {"type": "object", "additionalProperties": False, "properties": {"decisions": DECISIONS_SCHEMA}, "required": ["decisions"]},
    },
]

ANSWER_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "summary": {"type": "string"},
        "findings": {"type": "array", "items": {"type": "string"}},
        "risks": {"type": "array", "items": {"type": "string"}},
        "recommendation": {
            "type": "object", "additionalProperties": False,
            "properties": {"decisions": DECISIONS_SCHEMA, "rationale": {"type": "string"}},
            "required": ["decisions", "rationale"],
        },
    },
    "required": ["summary", "findings", "risks", "recommendation"],
}


def _catalog_brief() -> str:
    measures = [{"id": m["id"], "name": m["name"], "direction": m["direction"], "scope": m["scope"], "cost": m["cost"], "lag": m["lag"], "effects": m["effects"]} for m in MEASURES]
    districts = [{"id": d["id"], "name": d["name"], "populationShare": d["populationShare"], "indicators": d["indicators"]} for d in DISTRICTS]
    rules = {k: RULES[k] for k in ("budget", "decisionCount", "maxPerDirection", "horizonQuarters", "indicatorNames", "synergies", "incompatibilities")}
    return json.dumps({"measures": measures, "districts": districts, "rules": rules}, ensure_ascii=False)


INSTRUCTIONS = (
    "Ты — AI-советник акима в условной симуляции Астаны (синтетический датасет, не реальный прогноз). "
    "Цель: помочь улучшить план из пяти управленческих решений и объяснить компромиссы. "
    "Правила: Score = 0.7·средняя по населению + 0.3·худший район − 1 за каждый показатель ниже 40; "
    "эффект меры реализуется на (8 − лаг)/8. Ты НЕ считаешь сам: любую гипотезу проверяй инструментом simulate_plan, "
    "для поиска лучших вариантов используй find_improvements. Сначала проверь текущий план, затем 1–4 осмысленные гипотезы "
    "(с учётом цели пользователя, если она есть), затем дай итог. Рекомендуй только план, который ты проверил инструментом и который допустим. "
    "В тексте используй только числа из ответов инструментов, копируя их точно; не придумывай новых чисел. Пиши по-русски, коротко и по делу. "
    "Каталог: " + _catalog_brief()
)


def _numbers(text: str) -> set[float]:
    return {round(float(m.replace(",", ".")), 2) for m in NUMBERS.findall(text)}


def _district_name(district_id: str | None) -> str:
    return next((d["name"] for d in DISTRICTS if d["id"] == district_id), "весь город")


def _plan_label(decisions: list[Decision]) -> str:
    return ", ".join(f"{d.measureId} ({_district_name(d.districtId)})" for d in decisions) or "пустой план"


class AgentTools:
    """Server-side tools. Every call is recorded as a visible step."""

    def __init__(self, simulate_fn: Callable[[list[Decision]], dict], improve_fn: Callable[[list[Decision]], dict], event_active: bool):
        self._simulate = simulate_fn
        self._improve = improve_fn
        self._event_active = event_active
        self.steps: list[dict] = []
        self.seen_numbers: set[float] = set()

    def _remember(self, payload: Any) -> None:
        self.seen_numbers |= _numbers(json.dumps(payload, ensure_ascii=False))

    @staticmethod
    def _decisions(raw: list[dict]) -> list[Decision]:
        return [Decision(measureId=str(d.get("measureId", "")), districtId=d.get("districtId")) for d in raw]

    def simulate_plan(self, raw: list[dict]) -> dict:
        decisions = self._decisions(raw)
        calc = self._simulate(decisions)
        shown = calc["result"] or calc.get("preview")
        out: dict[str, Any] = {
            "valid": calc["valid"], "errors": [e["message"] for e in calc["errors"]],
            "cost": calc["cost"], "budget": calc["budget"], "baselineScore": round(calc["baseline"]["score"], 2),
        }
        if shown:
            weakest = min(shown["districts"], key=lambda r: r["afterScore"])
            out.update({
                "score": round(shown["score"], 2), "delta": round(shown["delta"], 2), "criticalCount": shown["criticalCount"],
                "cityAverage": round(shown["cityAverage"], 2), "weakestDistrict": weakest["name"], "weakestScore": round(weakest["afterScore"], 2),
                "districtScores": {r["name"]: round(r["afterScore"], 2) for r in shown["districts"]},
                "synergies": [f"{'+'.join(s['measureIds'])}: {s['indicator']} +{s['bonus']}" for s in shown["synergies"]],
                "isPreview": calc["result"] is None,
            })
        self._remember(out)
        note = "; ".join(out["errors"]) if out["errors"] else (f"худший район {out.get('weakestDistrict')} ({out.get('weakestScore')})" if shown else "")
        self.steps.append({
            "tool": "simulate_plan", "title": f"Проверил план: {_plan_label(decisions)}",
            "decisions": [d.model_dump() for d in decisions], "valid": calc["valid"],
            "score": shown["score"] if shown else None, "delta": shown["delta"] if shown else None, "cost": calc["cost"], "note": note,
        })
        return out

    def find_improvements(self, raw: list[dict]) -> dict:
        decisions = self._decisions(raw)
        if self._event_active:
            out = {"error": "Перебор недоступен при активном событии; проверяй варианты через simulate_plan."}
            self.steps.append({"tool": "find_improvements", "title": "Поиск улучшений недоступен при событии", "decisions": None, "valid": None, "score": None, "delta": None, "cost": None, "note": out["error"]})
            return out
        data = self._improve(decisions)
        out: dict[str, Any] = {"valid": data.get("valid"), "errors": [e["message"] for e in data.get("errors", [])]}
        best_plan = None
        if data.get("valid"):
            swap = data.get("bestSingleSwap")
            out.update({
                "currentScore": round(data["current"]["score"], 2), "percentile": round(data["percentile"], 1), "validPlans": data["populationCount"],
                "optimum": {"decisions": data["globalOptimum"]["decisions"], "score": round(data["globalOptimum"]["score"], 2), "cost": data["globalOptimum"]["cost"]},
                "bestSwap": None if swap is None else {"remove": swap["remove"], "add": swap["add"], "score": round(swap["plan"]["score"], 2), "cost": swap["plan"]["cost"]},
            })
            best_plan = swap["plan"] if swap else None
            note = f"процентиль {out['percentile']}, оптимум {out['optimum']['score']}" + (f", лучшая замена {swap['remove']['measureId']} → {swap['add']['measureId']} даёт {out['bestSwap']['score']}" if swap else ", замена одной меры не улучшает план")
        elif data.get("completion"):
            comp = data["completion"]
            out["bestCompletion"] = {"decisions": comp["decisions"], "score": round(comp["score"], 2), "cost": comp["cost"]}
            best_plan = comp
            note = f"лучшее дополнение до пяти мер даёт {out['bestCompletion']['score']}"
        else:
            note = "; ".join(out["errors"]) or "вариантов не найдено"
        self._remember(out)
        self.steps.append({
            "tool": "find_improvements", "title": f"Искал улучшения для: {_plan_label(decisions)}",
            "decisions": best_plan["decisions"] if best_plan else None, "valid": True if best_plan else None,
            "score": best_plan["score"] if best_plan else None, "delta": best_plan["delta"] if best_plan else None,
            "cost": best_plan["cost"] if best_plan else None, "note": note,
        })
        return out

    def call(self, name: str, arguments: str) -> dict:
        try:
            args = json.loads(arguments or "{}")
            raw = args.get("decisions", [])
            if not isinstance(raw, list):
                return {"error": "decisions must be a list"}
            if name == "simulate_plan":
                return self.simulate_plan(raw)
            if name == "find_improvements":
                return self.find_improvements(raw)
            return {"error": f"Неизвестный инструмент {name}"}
        except Exception as error:  # a bad tool call must not break the whole run
            return {"error": f"Инструмент не выполнен: {error}"}


def _empty(status: str, reason: str, model: str | None = None) -> dict:
    return {"status": status, "model": model, "reason": reason, "summary": "", "findings": [], "risks": [], "steps": [], "recommendation": None, "grounded": True, "iterations": 0}


def run_agent(
    decisions: list[Decision],
    goal: str | None,
    simulate_fn: Callable[[list[Decision]], dict],
    improve_fn: Callable[[list[Decision]], dict],
    event_active: bool,
    model: str,
    client: Any | None = None,
) -> dict:
    if client is None:
        if not os.getenv("OPENAI_API_KEY"):
            return _empty("unavailable", "OPENAI_API_KEY не задан на сервере: AI-агенту нужен ключ OpenAI.")
        from openai import OpenAI

        client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], timeout=60.0, max_retries=1)

    tools = AgentTools(simulate_fn, improve_fn, event_active)
    task = {
        "currentPlan": [d.model_dump() for d in decisions],
        "goal": goal or "Улучшить итоговый Score и объяснить компромиссы.",
        "eventActive": event_active,
    }
    text_format = {"format": {"type": "json_schema", "name": "agent_answer", "strict": True, "schema": ANSWER_SCHEMA}}
    try:
        response = client.responses.create(
            model=model, instructions=INSTRUCTIONS, tools=TOOLS, text=text_format,
            input=[{"role": "user", "content": json.dumps(task, ensure_ascii=False)}],
        )
        calls = 0
        iterations = 1
        while True:
            pending = [item for item in response.output if getattr(item, "type", None) == "function_call"]
            if not pending:
                break
            outputs = []
            for item in pending:
                calls += 1
                result = tools.call(item.name, item.arguments) if calls <= MAX_TOOL_CALLS else {"error": "Лимит вызовов инструментов исчерпан — дай итоговый ответ."}
                outputs.append({"type": "function_call_output", "call_id": item.call_id, "output": json.dumps(result, ensure_ascii=False)})
            iterations += 1
            if iterations > MAX_TOOL_CALLS + 3:
                return {**_empty("error", "Агент не завершил работу за отведённое число шагов.", model), "steps": tools.steps, "iterations": iterations}
            response = client.responses.create(model=model, instructions=INSTRUCTIONS, tools=TOOLS, text=text_format, previous_response_id=response.id, input=outputs)
        answer = json.loads(response.output_text)
    except Exception as error:
        return {**_empty("error", f"AI-агент недоступен: {type(error).__name__}. Расчёт и шаблонный анализ продолжают работать.", model), "steps": tools.steps}

    # Re-check the recommendation on the server; the model's word is not enough.
    rec_raw = answer.get("recommendation") or {}
    rec_decisions = AgentTools._decisions(rec_raw.get("decisions") or [])
    recommendation = None
    if rec_decisions:
        calc = simulate_fn(rec_decisions)
        result = calc["result"]
        recommendation = {
            "decisions": [d.model_dump() for d in rec_decisions], "rationale": str(rec_raw.get("rationale", "")),
            "valid": calc["valid"], "score": result["score"] if result else None, "delta": result["delta"] if result else None,
            "cost": calc["cost"], "criticalCount": result["criticalCount"] if result else None,
            "errors": [e["message"] for e in calc["errors"]],
        }
        if result:
            tools._remember({"s": round(result["score"], 2), "d": round(result["delta"], 2), "c": calc["cost"], "k": result["criticalCount"]})

    texts = [answer.get("summary", "")] + list(answer.get("findings", [])) + list(answer.get("risks", [])) + [recommendation["rationale"] if recommendation else ""]
    allowed = tools.seen_numbers | {float(n) for n in range(0, 11)} | {40.0, 100.0, 0.7, 0.3}
    grounded = all(num in allowed for text in texts for num in _numbers(text))
    return {
        "status": "ai", "model": model, "reason": None,
        "summary": str(answer.get("summary", "")), "findings": [str(x) for x in answer.get("findings", [])], "risks": [str(x) for x in answer.get("risks", [])],
        "steps": tools.steps, "recommendation": recommendation, "grounded": grounded, "iterations": iterations,
    }
