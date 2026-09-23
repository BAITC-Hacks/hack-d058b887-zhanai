"""Grounded Russian facts for both the model and the deterministic fallback."""
from __future__ import annotations

from .data_loader import DISTRICTS, MEASURE_BY_ID, RULES
from .simulator import BASELINE


def make_facts(result: dict, cost: int) -> list[str]:
    facts = [
        f"Исходный Score {BASELINE['score']:.2f}, после плана {result['score']:.2f}, изменение {result['delta']:+.2f} балла.",
        f"Расход {cost} из {RULES['budget']}, остаток {result['unusedBudget']}.",
        f"Средневзвешенная оценка города {result['cityAverage']:.2f}; оценка худшего района {result['minDistrictScore']:.2f}.",
        f"Критических значений ниже 40 было {BASELINE['criticalCount']}, стало {result['criticalCount']}.",
    ]
    for row in result["districts"]:
        facts.append(f"Район {row['name']}: {row['beforeScore']:.2f} → {row['afterScore']:.2f}.")
    for decision in result["decisions"]:
        measure = MEASURE_BY_ID[decision["measureId"]]
        district = next((d["name"] for d in DISTRICTS if d["id"] == decision["districtId"]), "город")
        effects = ", ".join(f"{key} {value:+.2f}" for key, value in decision["realizedEffects"].items())
        facts.append(f"{decision['measureId']} «{measure['name']}»: {district}, стоимость {decision['cost']}, лаг {decision['lag']} квартала, реализовано {decision['realizedShare']*100:.2f}% полного эффекта; {effects}.")
    for synergy in result["synergies"]:
        facts.append(f"Синергия {' + '.join(synergy['measureIds'])}: {synergy['indicator']} +{synergy['bonus']} в районе {synergy['districtId']}.")
    for synergy in result["missedSynergies"]:
        facts.append(f"Нереализованная синергия {' + '.join(synergy['measureIds'])}: {synergy['indicator']} +{synergy['bonus']} возможна только если обе меры входят в допустимый план.")
    empty = [RULES["directionNames"][direction] for direction, count in result["directionCoverage"].items() if count == 0]
    if empty:
        facts.append("Не охвачены направления: " + ", ".join(empty) + ".")
    return facts
