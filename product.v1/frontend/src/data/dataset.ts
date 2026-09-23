// Условный синтетический датасет из «Датасет районов.docx» (Доки/).
// Это тот же каталог, который сервер отдаёт через GET /api/catalog: числа
// здесь нужны для режима mock и для подсказок в интерфейсе. Источник истины
// для итогового расчёта — сервер.

export type DirectionId = 'transport' | 'ecology' | 'social' | 'safety' | 'services'
export type DistrictId = 'esil' | 'almaty' | 'saryarka' | 'baikonur' | 'nura'
export type IndicatorId = 'T1' | 'T2' | 'E1' | 'E2' | 'S1' | 'S2' | 'B1' | 'B2' | 'C1' | 'C2'
export type MeasureScope = 'district' | 'city'

export interface Direction {
  id: DirectionId
  name: string
  /** Формулировка из ТЗ, показывается подсказкой. */
  tzName: string
}

export interface Indicator {
  id: IndicatorId
  directionId: DirectionId
  name: string
  /** Что означают 100 и 0 по датасету. */
  meaning: string
}

export interface District {
  id: DistrictId
  name: string
  /** «в Нуре», «в районе Алматы» — для текстов фактов. */
  locative: string
  populationShare: number
  profile: string
  indicators: Record<IndicatorId, number>
}

export interface Measure {
  id: string
  directionId: DirectionId
  name: string
  scope: MeasureScope
  cost: number
  lag: number
  effects: Partial<Record<IndicatorId, number>>
}

export interface Synergy {
  /** Бонус применяется в районе меры `a` (если она районная). */
  a: string
  b: string
  indicator: IndicatorId
  bonus: number
}

export interface Incompatibility {
  a: string
  b: string
  scope: 'any' | 'sameDistrict'
  reason: string
}

export interface Rules {
  budget: number
  decisions: number
  maxPerDirection: number
  horizonQuarters: number
  criticalThreshold: number
  weights: Record<IndicatorId, number>
  score: { cityWeight: number; minWeight: number; criticalPenalty: number }
  ruleset: 'dataset' | 'all_directions'
}

export interface Decision {
  measureId: string
  districtId: DistrictId | null
}

export interface Preset {
  id: string
  name: string
  hint: string
  decisions: Decision[]
}

export interface CityEvent {
  id: string
  title: string
  text: string
  effects: { districtId: DistrictId; indicator: IndicatorId; delta: number }[]
  budgetDelta: number
}

export interface Catalog {
  dataVersion: string
  directions: Direction[]
  indicators: Indicator[]
  districts: District[]
  measures: Measure[]
  synergies: Synergy[]
  incompatibilities: Incompatibility[]
  rules: Rules
  presets: Preset[]
  events: CityEvent[]
}

export const DIRECTIONS: Direction[] = [
  { id: 'transport', name: 'Транспорт', tzName: 'транспорт' },
  { id: 'ecology', name: 'Экология', tzName: 'озеленение' },
  { id: 'social', name: 'Соцсфера', tzName: 'социальная инфраструктура' },
  { id: 'safety', name: 'Безопасность', tzName: 'безопасность' },
  { id: 'services', name: 'Сервисы', tzName: 'городской сервис' },
]

export const INDICATORS: Indicator[] = [
  { id: 'T1', directionId: 'transport', name: 'Разгрузка дорог', meaning: '100 = нет пробок в час пик, 0 = стоит всё' },
  { id: 'T2', directionId: 'transport', name: 'Доступность транспорта', meaning: '100 = все жители в 500 м от остановки с интервалом ≤10 мин' },
  { id: 'E1', directionId: 'ecology', name: 'Озеленение', meaning: '100 = не меньше 20 м² зелени на жителя' },
  { id: 'E2', directionId: 'ecology', name: 'Качество воздуха', meaning: '100 = зимой AQI ≤50, 0 = хронический смог' },
  { id: 'S1', directionId: 'social', name: 'Школы и детсады', meaning: '100 = нормативная потребность закрыта, без второй смены' },
  { id: 'S2', directionId: 'social', name: 'Поликлиники', meaning: '100 = норматив первичной медпомощи на жителя выполнен' },
  { id: 'B1', directionId: 'safety', name: 'Безопасность улиц', meaning: '100 = освещение и камеры везде, минимум происшествий' },
  { id: 'B2', directionId: 'safety', name: 'Безопасность дорог', meaning: '100 = минимум ДТП с пострадавшими' },
  { id: 'C1', directionId: 'services', name: 'Надёжность ЖКХ', meaning: '100 = нет аварий отопления и воды за год' },
  { id: 'C2', directionId: 'services', name: 'Скорость обращений', meaning: '100 = все обращения жителей закрыты в срок' },
]

const ind = (v: number[]): Record<IndicatorId, number> => ({
  T1: v[0], T2: v[1], E1: v[2], E2: v[3], S1: v[4], S2: v[5], B1: v[6], B2: v[7], C1: v[8], C2: v[9],
})

export const DISTRICTS: District[] = [
  { id: 'esil', name: 'Есиль', locative: 'в Есиле', populationShare: 0.27, profile: 'Богатый район, но с пробками на мостах и переполненными школами', indicators: ind([45, 62, 68, 72, 48, 55, 78, 60, 75, 70]) },
  { id: 'almaty', name: 'Алматы', locative: 'в районе Алматы', populationShare: 0.24, profile: 'Старое ЖКХ и пробки', indicators: ind([40, 75, 50, 55, 60, 65, 62, 52, 50, 60]) },
  { id: 'saryarka', name: 'Сарыарка', locative: 'в Сарыарке', populationShare: 0.20, profile: 'Смог от частного сектора, слабое озеленение', indicators: ind([50, 70, 42, 40, 62, 68, 58, 55, 45, 55]) },
  { id: 'baikonur', name: 'Байконур', locative: 'в Байконуре', populationShare: 0.13, profile: 'Середняк без ярких перекосов', indicators: ind([52, 68, 55, 50, 58, 60, 52, 58, 55, 58]) },
  { id: 'nura', name: 'Нура', locative: 'в Нуре', populationShare: 0.16, profile: 'Главный аутсайдер по соцсфере и транспорту', indicators: ind([55, 40, 45, 65, 38, 35, 55, 50, 60, 50]) },
]

export const MEASURES: Measure[] = [
  { id: 'M1', directionId: 'transport', name: 'Выделенные полосы для автобусов', scope: 'district', cost: 18, lag: 2, effects: { T1: 6, T2: 9 } },
  { id: 'M2', directionId: 'transport', name: 'Умные светофоры', scope: 'city', cost: 22, lag: 2, effects: { T1: 4, B2: 3 } },
  { id: 'M3', directionId: 'transport', name: 'Линия ЛРТ / расширение', scope: 'district', cost: 30, lag: 4, effects: { T1: 16, T2: 20, E2: 4 } },
  { id: 'M4', directionId: 'ecology', name: 'Парк или сквер', scope: 'district', cost: 15, lag: 2, effects: { E1: 12, E2: 3, B1: 2 } },
  { id: 'M5', directionId: 'ecology', name: 'Чистое топливо для частного сектора', scope: 'district', cost: 25, lag: 3, effects: { E2: 14, C1: 4 } },
  { id: 'M6', directionId: 'ecology', name: 'Городское озеленение и ветрозащита', scope: 'city', cost: 20, lag: 4, effects: { E1: 5, E2: 3 } },
  { id: 'M7', directionId: 'social', name: 'Школа и детсад (модульные)', scope: 'district', cost: 24, lag: 3, effects: { S1: 16 } },
  { id: 'M8', directionId: 'social', name: 'Центр семейного здоровья', scope: 'district', cost: 20, lag: 3, effects: { S2: 14 } },
  { id: 'M9', directionId: 'social', name: 'Дворовые спорт-хабы', scope: 'district', cost: 10, lag: 1, effects: { S1: 3, S2: 3, B1: 3 } },
  { id: 'M10', directionId: 'safety', name: 'Освещение и камеры Safe City', scope: 'district', cost: 12, lag: 1, effects: { B1: 12, B2: 2 } },
  { id: 'M11', directionId: 'safety', name: 'Безопасные переходы и школьные зоны', scope: 'district', cost: 10, lag: 1, effects: { B2: 12, T1: -2 } },
  { id: 'M12', directionId: 'services', name: 'Единая платформа обращений', scope: 'city', cost: 14, lag: 1, effects: { C2: 5 } },
  { id: 'M13', directionId: 'services', name: 'Модернизация тепло- и водосетей', scope: 'district', cost: 28, lag: 4, effects: { C1: 18, E2: 2 } },
  { id: 'M14', directionId: 'services', name: 'Аварийные бригады ЖКХ и оповещение', scope: 'city', cost: 16, lag: 1, effects: { C1: 5, C2: 2 } },
]

export const SYNERGIES: Synergy[] = [
  { a: 'M1', b: 'M2', indicator: 'T1', bonus: 2 },
  { a: 'M10', b: 'M12', indicator: 'B1', bonus: 2 },
  { a: 'M5', b: 'M6', indicator: 'E2', bonus: 2 },
]

export const INCOMPATIBILITIES: Incompatibility[] = [
  { a: 'M1', b: 'M3', scope: 'any', reason: 'либо выделенные полосы, либо ЛРТ' },
  { a: 'M4', b: 'M7', scope: 'sameDistrict', reason: 'конфликт за участок в одном районе' },
  { a: 'M5', b: 'M13', scope: 'sameDistrict', reason: 'дублирование программы в одном районе' },
]

export const RULES: Rules = {
  budget: 100,
  decisions: 5,
  maxPerDirection: 2,
  horizonQuarters: 8,
  criticalThreshold: 40,
  weights: { T1: 0.10, T2: 0.10, E1: 0.09, E2: 0.11, S1: 0.11, S2: 0.11, B1: 0.09, B2: 0.09, C1: 0.10, C2: 0.10 },
  score: { cityWeight: 0.7, minWeight: 0.3, criticalPenalty: 1 },
  ruleset: 'dataset',
}

export const PRESETS: Preset[] = [
  {
    id: 'example',
    name: 'Пример организаторов',
    hint: 'Набор из датасета: стоимость 95, Score 56.54',
    decisions: [
      { measureId: 'M7', districtId: 'nura' },
      { measureId: 'M8', districtId: 'nura' },
      { measureId: 'M10', districtId: 'nura' },
      { measureId: 'M12', districtId: null },
      { measureId: 'M5', districtId: 'saryarka' },
    ],
  },
  {
    id: 'weak',
    name: 'Слабый план',
    hint: 'Худший допустимый набор: всё в Байконуре, Score ниже базы',
    decisions: [
      { measureId: 'M8', districtId: 'baikonur' },
      { measureId: 'M9', districtId: 'baikonur' },
      { measureId: 'M10', districtId: 'baikonur' },
      { measureId: 'M13', districtId: 'baikonur' },
      { measureId: 'M11', districtId: 'almaty' },
    ],
  },
  {
    id: 'optimum',
    name: 'Оптимум по перебору',
    hint: 'Лучший из 694 395 допустимых наборов: Score 57.24',
    decisions: [
      { measureId: 'M2', districtId: null },
      { measureId: 'M3', districtId: 'nura' },
      { measureId: 'M8', districtId: 'nura' },
      { measureId: 'M9', districtId: 'nura' },
      { measureId: 'M14', districtId: null },
    ],
  },
]

// Каталог событий для режима mock. На сервере может быть свой список.
export const EVENTS: CityEvent[] = [
  { id: 'winter', title: 'Аварийная зима', text: 'Серия аварий на теплосетях правого берега', effects: [{ districtId: 'almaty', indicator: 'C1', delta: -8 }], budgetDelta: 0 },
  { id: 'smog', title: 'Смог над Сарыаркой', text: 'Безветренная неделя, частный сектор топит углём', effects: [{ districtId: 'saryarka', indicator: 'E2', delta: -6 }], budgetDelta: 0 },
  { id: 'sequester', title: 'Секвестр бюджета', text: 'Республиканский трансферт урезан', effects: [], budgetDelta: -10 },
  { id: 'nura-growth', title: 'Нура растёт быстрее плана', text: 'Новые жилые комплексы заселены раньше срока', effects: [{ districtId: 'nura', indicator: 'S1', delta: -5 }], budgetDelta: 0 },
  { id: 'flood', title: 'Весенний паводок', text: 'Подтопления на левом берегу', effects: [{ districtId: 'esil', indicator: 'T1', delta: -5 }, { districtId: 'esil', indicator: 'C1', delta: -3 }], budgetDelta: 0 },
]

export const DATASET: Catalog = {
  dataVersion: 'districts-v1',
  directions: DIRECTIONS,
  indicators: INDICATORS,
  districts: DISTRICTS,
  measures: MEASURES,
  synergies: SYNERGIES,
  incompatibilities: INCOMPATIBILITIES,
  rules: RULES,
  presets: PRESETS,
  events: EVENTS,
}

export const INDICATOR_IDS = INDICATORS.map((i) => i.id) as IndicatorId[]
export const DISTRICT_IDS = DISTRICTS.map((d) => d.id) as DistrictId[]
export const measureById = (id: string) => MEASURES.find((m) => m.id === id)
export const districtById = (id: DistrictId | null | undefined) => DISTRICTS.find((d) => d.id === id)
export const indicatorById = (id: IndicatorId) => INDICATORS.find((i) => i.id === id)!
export const directionById = (id: DirectionId) => DIRECTIONS.find((d) => d.id === id)!
