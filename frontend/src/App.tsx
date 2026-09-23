import { useState } from 'react'

type Direction = 'transport' | 'ecology' | 'social' | 'safety' | 'services'
type DistrictId = 'esil' | 'almaty' | 'saryarka' | 'baikonur' | 'nura'
type Measure = {
  id: string
  name: string
  direction: Direction
  cost: number
  lag: number
  scope: 'city' | 'district'
  effect: string
}
type Decision = { measureId: string; districtId: DistrictId | null }

const districts: { id: DistrictId; name: string; before: number; after: number; note: string }[] = [
  { id: 'nura', name: 'Нура', before: 49.18, after: 52.96, note: 'Школы · медицина' },
  { id: 'saryarka', name: 'Сарыарка', before: 54.65, after: 56.3, note: 'Воздух · озеленение' },
  { id: 'baikonur', name: 'Байконур', before: 56.63, after: 57.07, note: 'Городские сервисы' },
  { id: 'almaty', name: 'Алматы', before: 57.06, after: 57.5, note: 'ЖКХ · транспорт' },
  { id: 'esil', name: 'Есиль', before: 62.99, after: 63.43, note: 'Дороги · школы' },
]

const directionLabels: Record<Direction, string> = {
  transport: 'Транспорт', ecology: 'Экология', social: 'Соцсфера',
  safety: 'Безопасность', services: 'Сервисы',
}

const measures: Measure[] = [
  { id: 'M1', name: 'Выделенные полосы для автобусов', direction: 'transport', cost: 18, lag: 2, scope: 'district', effect: 'Дороги +6 · Транспорт +9' },
  { id: 'M2', name: 'Умные светофоры', direction: 'transport', cost: 22, lag: 2, scope: 'city', effect: 'Дороги +4 · БДД +3' },
  { id: 'M3', name: 'Линия ЛРТ / расширение', direction: 'transport', cost: 30, lag: 4, scope: 'district', effect: 'Дороги +16 · Транспорт +20' },
  { id: 'M4', name: 'Парк / сквер', direction: 'ecology', cost: 15, lag: 2, scope: 'district', effect: 'Озеленение +12 · Воздух +3' },
  { id: 'M5', name: 'Чистое топливо для частного сектора', direction: 'ecology', cost: 25, lag: 3, scope: 'district', effect: 'Качество воздуха +14' },
  { id: 'M6', name: 'Городское озеленение', direction: 'ecology', cost: 20, lag: 4, scope: 'city', effect: 'Зелень +5 · Воздух +3' },
  { id: 'M7', name: 'Школа + детсад', direction: 'social', cost: 24, lag: 3, scope: 'district', effect: 'Доступность образования +16' },
  { id: 'M8', name: 'Центр семейного здоровья', direction: 'social', cost: 20, lag: 3, scope: 'district', effect: 'Доступность медицины +14' },
  { id: 'M9', name: 'Дворовые спорт-хабы', direction: 'social', cost: 10, lag: 1, scope: 'district', effect: 'Соцсфера +3 · Безопасность +3' },
  { id: 'M10', name: 'Освещение и камеры', direction: 'safety', cost: 12, lag: 1, scope: 'district', effect: 'Безопасность улиц +12' },
  { id: 'M11', name: 'Безопасные переходы', direction: 'safety', cost: 10, lag: 1, scope: 'district', effect: 'БДД +12 · Дороги −2' },
  { id: 'M12', name: 'Платформа обращений жителей', direction: 'services', cost: 14, lag: 1, scope: 'city', effect: 'Скорость ответов +5' },
  { id: 'M13', name: 'Модернизация тепло- и водосетей', direction: 'services', cost: 28, lag: 4, scope: 'district', effect: 'Надёжность ЖКХ +18' },
  { id: 'M14', name: 'Аварийные бригады ЖКХ', direction: 'services', cost: 16, lag: 1, scope: 'city', effect: 'ЖКХ +5 · Обращения +2' },
]

const initialPlan: Decision[] = [
  { measureId: 'M7', districtId: 'nura' },
  { measureId: 'M8', districtId: 'nura' },
  { measureId: 'M10', districtId: 'nura' },
  { measureId: 'M12', districtId: null },
  { measureId: 'M5', districtId: 'saryarka' },
]

const money = (value: number) => value.toString().padStart(2, '0')
const districtName = (id: DistrictId | null) => id === null ? 'Весь город' : districts.find((district) => district.id === id)?.name ?? id

function App() {
  const [activeDistrict, setActiveDistrict] = useState<DistrictId>('nura')
  const [activeFilter, setActiveFilter] = useState<Direction | 'all'>('all')
  const [plan, setPlan] = useState<Decision[]>(initialPlan)
  const [isStale, setIsStale] = useState(false)
  const [notice, setNotice] = useState('')
  const spent = plan.reduce((total, decision) => total + (measures.find((measure) => measure.id === decision.measureId)?.cost ?? 0), 0)
  const selectedIds = new Set(plan.map((decision) => decision.measureId))
  const visibleMeasures = measures.filter((measure) => activeFilter === 'all' || measure.direction === activeFilter)

  function addMeasure(measure: Measure) {
    if (selectedIds.has(measure.id)) return
    if (plan.length >= 5) {
      setNotice('Для новой меры сначала освободите одно из пяти мест в плане.')
      return
    }
    setPlan([...plan, { measureId: measure.id, districtId: measure.scope === 'city' ? null : activeDistrict }])
    setIsStale(true)
    setNotice('План изменён. В следующей версии здесь появится свежий расчёт API.')
  }

  function removeMeasure(id: string) {
    setPlan(plan.filter((decision) => decision.measureId !== id))
    setIsStale(true)
    setNotice('План изменён. Демонстрационные показатели больше не относятся к нему.')
  }

  function demoAction() {
    setNotice('Это дизайн-макет. Кнопка будет подключена к готовому backend API.')
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <header className="topbar">
        <a className="brand" href="#overview" aria-label="Qala Lab — наверх">
          <span className="brand-mark"><span /></span>
          <span className="brand-copy"><strong>QALA<span>LAB</span></strong><small>decision intelligence</small></span>
        </a>
        <nav className="main-nav" aria-label="Навигация">
          <a className="active" href="#overview">Обзор</a>
          <a href="#catalog">Мероприятия</a>
          <a href="#results">Результат</a>
        </nav>
        <div className="topbar-right"><span className="live-dot" /> <span>Демо-сценарий</span><span className="topbar-divider" /> <span>Астана · 2026</span></div>
      </header>

      <main>
        <section className="intro" id="overview">
          <div className="intro-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> ГОРОДСКАЯ ЛАБОРАТОРИЯ РЕШЕНИЙ <span className="demo-tag">ПРОТОТИП</span></div>
            <h1>Город меняется<br /><em>от решений.</em></h1>
            <p>Пять решений. Один бюджет. Посмотрите, как ваш план меняет качество жизни в районах Астаны.</p>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="city-glow" />
            <div className="city-orbit orbit-one" />
            <div className="city-orbit orbit-two" />
            <div className="city-tower tower-a" /><div className="city-tower tower-b" /><div className="city-tower tower-c" /><div className="city-tower tower-d" />
            <span className="city-label">ASTANA · 51.16°N</span>
          </div>
        </section>

        <section className="kpi-grid" aria-label="Ключевые показатели">
          <div className="kpi-card kpi-primary">
            <div className="card-topline"><span>QUALITY OF LIFE SCORE</span><span className="kpi-icon">↗</span></div>
            <div className="score-flow"><span className="score-before">52.56</span><span className="score-arrow">→</span><strong>{isStale ? '—' : '56.54'}</strong></div>
            <div className="kpi-foot"><span className="positive-pill">{isStale ? 'Ожидает расчёта' : '+3.99 балла'}</span><span>после реализации плана</span></div>
          </div>
          <div className="kpi-card">
            <div className="card-topline"><span>ЕДИНЫЙ БЮДЖЕТ</span><span className="kpi-soft-icon">◉</span></div>
            <div className="mini-stat"><strong>{spent}</strong><span>/ 100</span></div>
            <div className="progress-track"><div style={{ width: `${Math.min(spent, 100)}%` }} /></div>
            <div className="sub-stat">Осталось {100 - spent} условных единиц</div>
          </div>
          <div className="kpi-card">
            <div className="card-topline"><span>КРИТИЧЕСКИЕ ПОКАЗАТЕЛИ</span><span className="kpi-soft-icon">◇</span></div>
            <div className="mini-stat"><strong>{isStale ? '—' : '0'}</strong><span className="struck">было 2</span></div>
            <div className="tiny-sparkles">✦ <span>{isStale ? 'Нужен новый расчёт' : 'Проблемные значения устранены'}</span></div>
          </div>
        </section>

        <section className="workspace-grid" id="catalog">
          <div className="panel district-panel">
            <div className="panel-head"><div><span className="panel-kicker">01 / ГОРОД</span><h2>Районы</h2></div><span className="count-pill">05</span></div>
            <p className="panel-description">Выберите район для новой меры</p>
            <div className="district-list">
              {districts.map((district) => (
                <button key={district.id} type="button" className={`district-item ${activeDistrict === district.id ? 'selected' : ''}`} onClick={() => setActiveDistrict(district.id)}>
                  <span className="district-symbol">{district.name.slice(0, 1)}</span>
                  <span className="district-copy"><strong>{district.name}</strong><small>{district.note}</small></span>
                  <span className="district-score">{district.before.toFixed(1)}</span>
                </button>
              ))}
            </div>
            <div className="district-hint"><span className="hint-symbol">i</span><span>Все показатели — условные данные для симуляции.</span></div>
          </div>

          <div className="panel measures-panel">
            <div className="panel-head"><div><span className="panel-kicker">02 / ДЕЙСТВИЯ</span><h2>Мероприятия</h2></div><span className="count-pill">14 мер</span></div>
            <div className="filter-row" role="group" aria-label="Фильтр направлений">
              <button type="button" className={activeFilter === 'all' ? 'active' : ''} onClick={() => setActiveFilter('all')}>Все</button>
              {(Object.keys(directionLabels) as Direction[]).map((direction) => <button type="button" key={direction} className={activeFilter === direction ? 'active' : ''} onClick={() => setActiveFilter(direction)}>{directionLabels[direction]}</button>)}
            </div>
            <div className="measure-list">
              {visibleMeasures.map((measure) => (
                <article className="measure-item" key={measure.id}>
                  <div className="measure-code">{measure.id}</div>
                  <div className="measure-info">
                    <div className="measure-heading"><span className={`direction-dot ${measure.direction}`} /> <span>{directionLabels[measure.direction]}</span><span className="measure-scope">· {measure.scope === 'city' ? 'весь город' : '1 район'}</span></div>
                    <h3>{measure.name}</h3>
                    <p>{measure.effect} <span>· лаг {measure.lag} кв.</span></p>
                  </div>
                  <div className="measure-actions"><strong>{measure.cost}</strong><button type="button" aria-label={`${selectedIds.has(measure.id) ? 'Уже выбрано' : 'Добавить'} ${measure.name}`} className={selectedIds.has(measure.id) ? 'chosen' : ''} onClick={() => addMeasure(measure)}>{selectedIds.has(measure.id) ? '✓' : '+'}</button></div>
                </article>
              ))}
            </div>
          </div>

          <div className="panel plan-panel">
            <div className="panel-head"><div><span className="panel-kicker">03 / ВАШ СЦЕНАРИЙ</span><h2>План действий</h2></div><span className="count-pill">{plan.length} / 5</span></div>
            <div className="plan-meter"><div style={{ width: `${Math.min(plan.length * 20, 100)}%` }} /></div>
            <p className="panel-description">Пять решений в пределах бюджета</p>
            <div className="plan-list">
              {plan.map((decision, index) => {
                const measure = measures.find((item) => item.id === decision.measureId)!
                return <div className="plan-item" key={decision.measureId}>
                  <span className="plan-number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="plan-detail"><strong>{measure.name}</strong><small>{districtName(decision.districtId)} <span>· {measure.cost} ед.</span></small></span>
                  <button type="button" className="remove-button" aria-label={`Удалить ${measure.name}`} onClick={() => removeMeasure(measure.id)}>×</button>
                </div>
              })}
              {plan.length === 0 && <div className="empty-plan">Выберите меры из каталога</div>}
            </div>
            <div className="plan-bottom"><div><span>Итого</span><strong>{money(spent)} <small>/ 100</small></strong></div><button type="button" className="primary-button" onClick={demoAction}>Рассчитать план <span>↗</span></button><small className="demo-disclaimer">Дизайн-макет · расчёт подключим следующим шагом</small></div>
          </div>
        </section>

        <section className={`results-section ${isStale ? 'results-stale' : ''}`} id="results">
          <div className="results-heading"><div><span className="panel-kicker">04 / ЭФФЕКТ РЕШЕНИЙ</span><h2>Что изменится?</h2></div><div className="results-actions"><button type="button" onClick={demoAction}>✧ Событие</button><button type="button" onClick={demoAction}>↗ Улучшить план</button></div></div>
          <div className="results-grid">
            <div className="panel chart-panel"><div className="chart-title"><strong>Районы до и после</strong><span><i className="legend-before" /> До <i className="legend-after" /> После</span></div>{districts.map((district) => <div className="chart-row" key={district.id}><span>{district.name}</span><div className="chart-bars"><div className="bar-before" style={{ width: `${district.before}%` }} /><div className="bar-after" style={{ width: `${district.after}%` }} /></div><strong>+{(district.after - district.before).toFixed(1)}</strong></div>)}</div>
            <div className="panel ai-panel"><div className="ai-title"><span className="ai-mark">✦</span><div><small>AI-ПОМОЩНИК</small><h3>Коротко о вашем плане</h3></div></div><p>План усиливает самый слабый район — Нуру. Школа, поликлиника и меры безопасности устраняют критические показатели, а городская платформа обращений приносит дополнительный эффект.</p><div className="ai-bottom"><span>Демо-текст на основе примера</span><button type="button" onClick={demoAction}>Подробнее ↗</button></div></div>
          </div>
          {isStale && <div className="stale-overlay">План изменён · результаты ниже — демонстрационный пример</div>}
        </section>
      </main>

      <footer><span>QALA LAB <span className="footer-separator">/</span> Аким на 5 часов</span><span>Синтетические данные · не прогноз реального города</span></footer>
      {notice && <div className="toast" role="status"><span>✦</span>{notice}<button type="button" onClick={() => setNotice('')} aria-label="Закрыть сообщение">×</button></div>}
    </div>
  )
}

export default App
