"""One-page Markdown brief, generated from verified simulator facts."""
from __future__ import annotations


def render_brief(calculated: dict, commentary: dict) -> str:
    result = calculated["result"]
    baseline = calculated["baseline"]
    district_lines = [f"| {d['name']} | {d['beforeScore']:.2f} | {d['afterScore']:.2f} |" for d in result["districts"]]
    measure_lines = [f"| {d['measureId']} | {d['name']} | {d['districtId'] or 'весь город'} | {d['cost']} |" for d in result["decisions"]]
    facts = "\n".join(f"- {fact}" for fact in result["facts"])
    strengths = "\n".join(f"- {line}" for line in commentary["strengths"])
    risks = "\n".join(f"- {line}" for line in commentary["risks"])
    ai_note = "AI-анализ" if commentary["status"] == "ai" else "Шаблонное объяснение без AI"
    return f"""# Аким на 5 часов — обоснование плана

Условный синтетический датасет. Результаты — последствия по модели, не прогноз реальной Астаны.

## Итог

Score: **{baseline['score']:.2f} → {result['score']:.2f}** ({result['delta']:+.2f}). Затраты: **{calculated['cost']} / {calculated['budget']}**; остаток: **{calculated['remainingBudget']}**. Критических показателей: **{baseline['criticalCount']} → {result['criticalCount']}**.

## Решения

| ID | Мероприятие | Район | Стоимость |
| --- | --- | --- | ---: |
{chr(10).join(measure_lines)}

## Районы

| Район | До | После |
| --- | ---: | ---: |
{chr(10).join(district_lines)}

## Факты расчёта

{facts}

## {ai_note}

{commentary['summary']}

Сильные стороны:
{strengths}

Риски:
{risks}
"""
