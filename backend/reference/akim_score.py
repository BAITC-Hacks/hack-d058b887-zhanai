"""Reference scoring engine for track 12 ("Аким на 5 часов") + brute-force optimum."""
import itertools
import numpy as np

DISTRICTS = ["Есиль", "Алматы", "Сарыарка", "Байконур", "Нура"]
POP = np.array([0.27, 0.24, 0.20, 0.13, 0.16])
IND = ["T1", "T2", "E1", "E2", "S1", "S2", "B1", "B2", "C1", "C2"]
W = np.array([0.10, 0.10, 0.09, 0.11, 0.11, 0.11, 0.09, 0.09, 0.10, 0.10])
BASE = np.array([
    [45, 62, 68, 72, 48, 55, 78, 60, 75, 70],
    [40, 75, 50, 55, 60, 65, 62, 52, 50, 60],
    [50, 70, 42, 40, 62, 68, 58, 55, 45, 55],
    [52, 68, 55, 50, 58, 60, 52, 58, 55, 58],
    [55, 40, 45, 65, 38, 35, 55, 50, 60, 50],
], dtype=float)
H = 8
# id: (direction, type, cost, lag, {indicator: effect})
MEASURES = {
    "M1": ("Транспорт", "Район", 18, 2, {"T1": 6, "T2": 9}),
    "M2": ("Транспорт", "Город", 22, 2, {"T1": 4, "B2": 3}),
    "M3": ("Транспорт", "Район", 30, 4, {"T1": 16, "T2": 20, "E2": 4}),
    "M4": ("Экология", "Район", 15, 2, {"E1": 12, "E2": 3, "B1": 2}),
    "M5": ("Экология", "Район", 25, 3, {"E2": 14, "C1": 4}),
    "M6": ("Экология", "Город", 20, 4, {"E1": 5, "E2": 3}),
    "M7": ("Соцсфера", "Район", 24, 3, {"S1": 16}),
    "M8": ("Соцсфера", "Район", 20, 3, {"S2": 14}),
    "M9": ("Соцсфера", "Район", 10, 1, {"S1": 3, "S2": 3, "B1": 3}),
    "M10": ("Безопасность", "Район", 12, 1, {"B1": 12, "B2": 2}),
    "M11": ("Безопасность", "Район", 10, 1, {"B2": 12, "T1": -2}),
    "M12": ("Сервисы", "Город", 14, 1, {"C2": 5}),
    "M13": ("Сервисы", "Район", 28, 4, {"C1": 18, "E2": 2}),
    "M14": ("Сервисы", "Город", 16, 1, {"C1": 5, "C2": 2}),
}
SYNERGY = [("M1", "M2", "T1", 2), ("M10", "M12", "B1", 2), ("M5", "M6", "E2", 2)]
EXCL_ANY = [("M1", "M3")]
EXCL_SAME_DISTRICT = [("M4", "M7"), ("M5", "M13")]
BUDGET = 100


def validate(plan):
    """plan: list of (measure_id, district or None). Returns error string or None."""
    if len(plan) != 5:
        return "Решений должно быть ровно 5"
    ids = [m for m, _ in plan]
    if len(set(ids)) != 5:
        return "Мероприятия не должны повторяться"
    cost = sum(MEASURES[m][2] for m in ids)
    if cost > BUDGET:
        return f"Превышен бюджет: {cost} > {BUDGET}"
    for m, d in plan:
        if MEASURES[m][1] == "Район" and d not in DISTRICTS:
            return f"Для {m} нужно указать район"
        if MEASURES[m][1] == "Город" and d is not None:
            return f"Для {m} район не указывается"
    dirs = {}
    for m in ids:
        dirs[MEASURES[m][0]] = dirs.get(MEASURES[m][0], 0) + 1
    for k, v in dirs.items():
        if v > 2:
            return f"Больше 2 мер из направления «{k}»"
    for a, b in EXCL_ANY:
        if a in ids and b in ids:
            return f"{a} и {b} несовместимы"
    where = dict(plan)
    for a, b in EXCL_SAME_DISTRICT:
        if a in ids and b in ids and where[a] == where[b]:
            return f"{a} и {b} нельзя в одном районе"
    return None


def score(plan):
    I = BASE.copy()
    where = dict(plan)
    for m, d in plan:
        direction, typ, cost, lag, eff = MEASURES[m]
        k = (H - lag) / H
        rows = [DISTRICTS.index(d)] if typ == "Район" else range(5)
        for ind, e in eff.items():
            for r in rows:
                I[r, IND.index(ind)] += e * k
    for a, b, ind, bonus in SYNERGY:
        if a in where and b in where:
            I[DISTRICTS.index(where[a]), IND.index(ind)] += bonus
    I = np.clip(I, 0, 100)
    D = I @ W
    d_avg = float(POP @ D)
    n_crit = int((I < 40).sum())
    return 0.7 * d_avg + 0.3 * D.min() - 1.0 * n_crit, D, n_crit, I


if __name__ == "__main__":
    base_D = BASE @ W
    print("Районы (база):", dict(zip(DISTRICTS, base_D.round(2))))
    s0, D0, c0, _ = score([])
    print(f"Базовый Score без действий: {s0:.2f}  (крит. пар: {c0})")

    example = [("M7", "Нура"), ("M8", "Нура"), ("M10", "Нура"), ("M12", None), ("M5", "Сарыарка")]
    print("Пример валиден:", validate(example) is None, "| стоимость", sum(MEASURES[m][2] for m, _ in example))
    s1, D1, c1, _ = score(example)
    print(f"Score примера: {s1:.2f} (+{s1 - s0:.2f}), крит. пар: {c1}")

    cheapest = [("M9", "Нура"), ("M11", "Нура"), ("M10", "Нура"), ("M12", None), ("M4", "Нура")]
    print("Самый дешёвый набор валиден:", validate(cheapest) is None,
          "| стоимость", sum(MEASURES[m][2] for m, _ in cheapest), f"| Score {score(cheapest)[0]:.2f}")

    # ---- brute force over all valid plans ----
    ids = list(MEASURES)
    best = []
    n_valid = 0
    for subset in itertools.combinations(ids, 5):
        cost = sum(MEASURES[m][2] for m in subset)
        if cost > BUDGET:
            continue
        if "M1" in subset and "M3" in subset:
            continue
        dirs = {}
        for m in subset:
            dirs[MEASURES[m][0]] = dirs.get(MEASURES[m][0], 0) + 1
        if max(dirs.values()) > 2:
            continue
        choices = [DISTRICTS if MEASURES[m][1] == "Район" else [None] for m in subset]
        for assign in itertools.product(*choices):
            plan = list(zip(subset, assign))
            where = dict(plan)
            bad = False
            for a, b in EXCL_SAME_DISTRICT:
                if a in where and b in where and where[a] == where[b]:
                    bad = True
                    break
            if bad:
                continue
            n_valid += 1
            s, D, c, _ = score(plan)
            best.append((s, cost, plan))
    best.sort(key=lambda x: -x[0])
    print(f"\nВсего валидных наборов: {n_valid}")
    print("Топ-5 наборов:")
    for s, cost, plan in best[:5]:
        print(f"  Score {s:.2f}  стоимость {cost:3d}  ", [(m, d or 'город') for m, d in plan])
    print(f"\nХудший валидный набор: {best[-1][0]:.2f}", [(m, d or 'город') for m, d in best[-1][2]])
