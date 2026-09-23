import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DistrictResult, IndicatorValues } from '../api'
import { Catalog } from '../components/catalog/Catalog'
import { CityMap } from '../components/city/CityMap'
import { Portfolio } from '../components/portfolio/Portfolio'
import { DATASET, type Decision, type DistrictId } from '../data/dataset'
import { decisionUnavailableReason, districtOptions } from './availability'
import { MEASURE_DRAG_TYPE, readMeasureDrag, writeMeasureDrag } from './measureDrag'

const currentValues = Object.fromEntries(DATASET.districts.map((d) => [d.id, d.indicators])) as Record<DistrictId, IndicatorValues>
const districts: DistrictResult[] = DATASET.districts.map((d) => ({
  districtId: d.id, beforeScore: 50, afterScore: 50,
  beforeIndicators: d.indicators, afterIndicators: d.indicators,
  criticalBefore: [], criticalAfter: [],
}))
const decision = (measureId: string, districtId: DistrictId | null = 'nura'): Decision => ({ measureId, districtId })
function transfer(id?: string) {
  const values = new Map<string, string>()
  const data: Pick<DataTransfer, 'effectAllowed' | 'dropEffect' | 'setData' | 'getData'> = { effectAllowed: 'none', dropEffect: 'none', setData: (key: string, value: string) => { values.set(key, value) }, getData: (key: string) => values.get(key) ?? '' }
  if (id) writeMeasureDrag(data, id)
  return data
}

function pointer(target: Element | Window, type: string, x: number, y: number, pointerType = 'mouse', button = 0) {
  // jsdom has MouseEvent but no native PointerEvent/capture implementation.
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button })
  Object.defineProperties(event, { pointerId: { value: 7 }, pointerType: { value: pointerType }, isPrimary: { value: true } })
  fireEvent(target, event)
  return event
}

function captureOn(element: Element) {
  let captured = false
  const set = vi.fn(() => { captured = true })
  const release = vi.fn(() => { captured = false })
  Object.assign(element, { setPointerCapture: set, releasePointerCapture: release, hasPointerCapture: () => captured })
  return { set, release }
}

describe('shared placement rules', () => {
  it('enforces global conflicts even across districts', () => {
    expect(decisionUnavailableReason(DATASET, decision('M3', 'almaty'), [decision('M1')], 82)).toContain('несовместимо с M1')
  })
  it('enforces local conflicts only in the same district', () => {
    expect(decisionUnavailableReason(DATASET, decision('M4'), [decision('M7')], 76)).toContain('M7 уже здесь')
    expect(decisionUnavailableReason(DATASET, decision('M4', 'almaty'), [decision('M7')], 76)).toBeNull()
  })
  it('prevents stale drag or dropdown data bypassing budget, uniqueness, direction and slot limits', () => {
    expect(decisionUnavailableReason(DATASET, decision('M7'), [], 23)).toContain('не хватает бюджета')
    expect(decisionUnavailableReason(DATASET, decision('M7', 'almaty'), [decision('M7')], 76)).toContain('уже в плане')
    expect(decisionUnavailableReason(DATASET, decision('M9'), [decision('M7'), decision('M8')], 56)).toContain('направление')
    expect(decisionUnavailableReason(DATASET, decision('M4'), DATASET.presets[0].decisions, 5)).toContain('все пять решений заняты')
  })
  it('validates city scope and district existence', () => {
    expect(decisionUnavailableReason(DATASET, decision('M12', null), [], 100)).toBeNull()
    expect(decisionUnavailableReason(DATASET, decision('M12', 'nura'), [], 100)).toContain('всему городу')
    expect(decisionUnavailableReason(DATASET, decision('M7', null), [], 100)).toBe('выберите район')
    expect(decisionUnavailableReason(DATASET, decision('M7', 'missing' as DistrictId), [], 100)).toContain('нет в каталоге')
    expect(decisionUnavailableReason(DATASET, decision('M999'), [], 100)).toContain('недоступна')
  })
  it('preserves room for all directions under the explicit all_directions ruleset', () => {
    const strict = { ...DATASET, rules: { ...DATASET.rules, ruleset: 'all_directions' as const } }
    expect(decisionUnavailableReason(strict, decision('M8'), [decision('M7')], 76)).toContain('каждого направления')
    expect(decisionUnavailableReason(DATASET, decision('M8'), [decision('M7')], 76)).toBeNull()
  })
  it('recommends the lowest available district when the weakest district is blocked', () => {
    const options = districtOptions(DATASET, DATASET.measures.find((m) => m.id === 'M4')!, [decision('M7', 'saryarka')], currentValues, 76)
    expect(options.find((o) => o.districtId === 'saryarka')).toMatchObject({ isWorst: false, blockedReason: expect.stringContaining('M7') })
    expect(options.find((o) => o.isWorst)?.districtId).toBe('nura')
  })
})

describe('measure transfer payload', () => {
  it('writes a marked payload and supports the marked plain text fallback', () => {
    const data = transfer('M7')
    expect(data.effectAllowed).toBe('copy')
    expect(data.getData(MEASURE_DRAG_TYPE)).toBe('M7')
    expect(readMeasureDrag(data)).toBe('M7')
    data.setData(MEASURE_DRAG_TYPE, '')
    expect(readMeasureDrag(data)).toBe('M7')
  })
  it('ignores unrelated text, files and links dragged into the map', () => {
    const data = transfer()
    for (const text of ['M7', '<img src=x>', 'https://example.com', 'akim-measure:M7;alert(1)']) {
      data.setData('text/plain', text)
      expect(readMeasureDrag(data)).toBeNull()
    }
  })
})

describe('mouse and pen drag fallback', () => {
  function setup(decisions: Decision[] = []) {
    const onDrag = vi.fn(), onDrop = vi.fn()
    const view = render(<Catalog catalog={DATASET} decisions={decisions} remainingBudget={100} currentValues={currentValues} onAdd={vi.fn()} onDragMeasure={onDrag} onPointerDrop={onDrop} />)
    const card = screen.getByRole('article', { name: 'M7 · Школа и детсад (модульные)' })
    const capture = captureOn(card)
    return { ...view, card, onDrag, onDrop, capture }
  }
  it('requires real movement before placing and passes the release coordinates once', () => {
    const { card, onDrag, onDrop, capture } = setup()
    pointer(card, 'pointerdown', 100, 100)
    pointer(card, 'pointermove', 104, 103)
    pointer(card, 'pointerup', 104, 103)
    expect(onDrag).not.toHaveBeenCalled()
    expect(onDrop).not.toHaveBeenCalled()
    pointer(card, 'pointerdown', 100, 100)
    pointer(card, 'pointermove', 115, 100)
    expect(onDrag).toHaveBeenLastCalledWith('M7')
    pointer(card, 'pointermove', 450, 370)
    pointer(card, 'pointerup', 460, 380)
    expect(onDrop).toHaveBeenCalledExactlyOnceWith('M7', 460, 380)
    expect(onDrag).toHaveBeenLastCalledWith(null)
    expect(capture.release).toHaveBeenCalledTimes(2)
  })
  it('leaves touch scrolling and interactive controls untouched', () => {
    const { card, onDrag, onDrop, capture } = setup()
    expect(pointer(card, 'pointerdown', 10, 10, 'touch').defaultPrevented).toBe(false)
    pointer(card, 'pointermove', 50, 80, 'touch')
    pointer(card, 'pointerup', 50, 80, 'touch')
    const button = screen.getByRole('button', { name: 'Выбрать район для M7' })
    expect(pointer(button, 'pointerdown', 10, 10).defaultPrevented).toBe(false)
    pointer(button, 'pointermove', 50, 80)
    pointer(button, 'pointerup', 50, 80)
    fireEvent.click(button)
    const select = screen.getByRole('combobox', { name: 'Район для M7' })
    expect(pointer(select, 'pointerdown', 10, 10).defaultPrevented).toBe(false)
    expect(capture.set).not.toHaveBeenCalled()
    expect(onDrag).not.toHaveBeenCalled()
    expect(onDrop).not.toHaveBeenCalled()
  })
  it('allows primary pen placement but ignores the right mouse button and blocked cards', () => {
    const { card, onDrop } = setup([decision('M7')])
    pointer(card, 'pointerdown', 10, 10)
    pointer(card, 'pointermove', 50, 80)
    pointer(card, 'pointerup', 50, 80)
    expect(onDrop).not.toHaveBeenCalled()
    const available = screen.getByRole('article', { name: 'M4 · Парк или сквер' })
    captureOn(available)
    pointer(available, 'pointerdown', 10, 10, 'mouse', 2)
    pointer(available, 'pointermove', 50, 80)
    pointer(available, 'pointerup', 50, 80)
    expect(onDrop).not.toHaveBeenCalled()
    pointer(available, 'pointerdown', 10, 10, 'pen')
    pointer(available, 'pointermove', 50, 80, 'pen')
    pointer(available, 'pointerup', 60, 90, 'pen')
    expect(onDrop).toHaveBeenCalledExactlyOnceWith('M4', 60, 90)
  })
  it('Escape, pointer cancellation and window blur release capture without adding', () => {
    const { card, onDrop, onDrag, capture } = setup()
    for (const cancellation of ['escape', 'pointercancel', 'blur']) {
      pointer(card, 'pointerdown', 10, 10)
      pointer(card, 'pointermove', 50, 80)
      if (cancellation === 'escape') fireEvent.keyDown(window, { key: 'Escape' })
      else if (cancellation === 'blur') fireEvent.blur(window)
      else pointer(card, 'pointercancel', 50, 80)
      pointer(card, 'pointerup', 60, 90)
      expect(onDrag).toHaveBeenLastCalledWith(null)
    }
    expect(onDrop).not.toHaveBeenCalled()
    expect(capture.release).toHaveBeenCalledTimes(3)
  })
  it('prevents native drag from duplicating a captured pointer gesture', () => {
    const { card, onDrag, onDrop } = setup()
    pointer(card, 'pointerdown', 10, 10)
    pointer(card, 'pointermove', 50, 80)
    expect(fireEvent.dragStart(card, { dataTransfer: transfer() })).toBe(false)
    expect(onDrag).toHaveBeenCalledExactlyOnceWith('M7')
    pointer(card, 'pointerup', 70, 90)
    expect(onDrop).toHaveBeenCalledTimes(1)
  })
})

describe('accessible placement and map drop', () => {
  it('supports choosing a district in a native list then explicitly adding it', () => {
    const onAdd = vi.fn()
    render(<Catalog catalog={DATASET} decisions={[]} remainingBudget={100} currentValues={currentValues} onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать район для M7' }))
    const select = screen.getByRole('combobox', { name: 'Район для M7' })
    expect(select).toHaveValue('nura')
    fireEvent.change(select, { target: { value: 'almaty' } })
    expect(onAdd).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Добавить в район Алматы' }))
    expect(onAdd).toHaveBeenCalledExactlyOnceWith(decision('M7', 'almaty'))
  })
  it('only starts dragging an available card', () => {
    const onDrag = vi.fn()
    render(<Catalog catalog={DATASET} decisions={[decision('M1')]} remainingBudget={82} currentValues={currentValues} onAdd={vi.fn()} onDragMeasure={onDrag} />)
    const data = transfer()
    const enabled = screen.getByRole('article', { name: 'M7 · Школа и детсад (модульные)' })
    fireEvent.dragStart(enabled, { dataTransfer: data })
    expect(onDrag).toHaveBeenLastCalledWith('M7')
    expect(readMeasureDrag(data)).toBe('M7')
    fireEvent.dragEnd(enabled)
    expect(onDrag).toHaveBeenLastCalledWith(null)
    onDrag.mockClear()
    const blocked = screen.getByRole('article', { name: 'M3 · Линия ЛРТ / расширение' })
    expect(blocked).toHaveAttribute('draggable', 'false')
    fireEvent.dragStart(blocked, { dataTransfer: data })
    expect(onDrag).not.toHaveBeenCalled()
  })
  it('uses a distinct drawer anchor and disables dragging when the map is behind a modal', () => {
    const onDrag = vi.fn()
    const { container } = render(<Catalog id="mobile-catalog" allowDrag={false} catalog={DATASET} decisions={[]} remainingBudget={100} currentValues={currentValues} onAdd={vi.fn()} onDragMeasure={onDrag} />)
    expect(container.querySelector('#mobile-catalog')).toBeInTheDocument()
    expect(container.querySelector('#catalog')).not.toBeInTheDocument()
    const card = screen.getByRole('article', { name: 'M7 · Школа и детсад (модульные)' })
    expect(card).toHaveAttribute('draggable', 'false')
    fireEvent.dragStart(card, { dataTransfer: transfer() })
    expect(onDrag).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать район для M7' }))
    expect(screen.getByRole('combobox', { name: 'Район для M7' })).toHaveValue('nura')
  })
  it('adds a district measure once and preserves keyboard inspection', () => {
    const onDrop = vi.fn()
    const onSelect = vi.fn()
    render(<CityMap catalog={DATASET} districts={districts} showAfter={false} selected={null} onSelect={onSelect} draggedMeasureId="M7" decisions={[]} remainingBudget={100} currentValues={currentValues} onDropMeasure={onDrop} />)
    const nura = screen.getByRole('button', { name: /^Нура: оценка/ })
    expect(nura).toHaveAttribute('data-drop-state', 'allowed')
    fireEvent.dragOver(nura, { dataTransfer: transfer('M7') })
    fireEvent.drop(nura, { dataTransfer: transfer('M7') })
    expect(onDrop).toHaveBeenCalledExactlyOnceWith('M7', 'nura')
    fireEvent.keyDown(nura, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('nura')
  })
  it('a city measure dropped on a district still affects the whole city once', () => {
    const onDrop = vi.fn()
    render(<CityMap catalog={DATASET} districts={districts} showAfter={false} selected={null} onSelect={vi.fn()} draggedMeasureId="M12" onDropMeasure={onDrop} />)
    fireEvent.drop(screen.getByRole('button', { name: /^Нура: оценка/ }), { dataTransfer: transfer('M12') })
    expect(onDrop).toHaveBeenCalledExactlyOnceWith('M12', null)
  })
  it('does not apply an old transfer after Escape has cancelled the drag', () => {
    const onDrop = vi.fn()
    const { rerender } = render(<CityMap catalog={DATASET} districts={districts} showAfter={false} selected={null} onSelect={vi.fn()} draggedMeasureId="M7" onDropMeasure={onDrop} />)
    rerender(<CityMap catalog={DATASET} districts={districts} showAfter={false} selected={null} onSelect={vi.fn()} draggedMeasureId={null} onDropMeasure={onDrop} />)
    fireEvent.drop(screen.getByRole('button', { name: /^Нура: оценка/ }), { dataTransfer: transfer('M7') })
    expect(onDrop).not.toHaveBeenCalled()
  })
  it('rejects local conflicts on drop and exposes a readable reason', () => {
    const onDrop = vi.fn()
    render(<CityMap catalog={DATASET} districts={districts} showAfter={false} selected={null} onSelect={vi.fn()} draggedMeasureId="M4" decisions={[decision('M7')]} remainingBudget={76} currentValues={currentValues} onDropMeasure={onDrop} />)
    const nura = screen.getByRole('button', { name: /^Нура: оценка/ })
    expect(nura).toHaveAttribute('data-drop-state', 'blocked')
    fireEvent.dragOver(nura, { dataTransfer: transfer('M4') })
    expect(screen.getByRole('status')).toHaveTextContent('M7 уже здесь')
    fireEvent.drop(nura, { dataTransfer: transfer('M4') })
    expect(onDrop).not.toHaveBeenCalled()
  })
  it('shows district conflict feedback while the pointer is captured by the source card', () => {
    render(<CityMap catalog={DATASET} districts={districts} showAfter={false} selected={null} onSelect={vi.fn()} draggedMeasureId="M4" decisions={[decision('M7')]} remainingBudget={76} currentValues={currentValues} onDropMeasure={vi.fn()} />)
    const nura = screen.getByRole('button', { name: /^Нура: оценка/ })
    const original = Object.getOwnPropertyDescriptor(document, 'elementFromPoint')
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => nura) })
    try {
      pointer(window, 'pointermove', 500, 300)
      expect(screen.getByRole('status')).toHaveTextContent('Нура: M7 уже здесь')
    } finally {
      if (original) Object.defineProperty(document, 'elementFromPoint', original)
      else Reflect.deleteProperty(document, 'elementFromPoint')
    }
  })
  it('prevents conflicting portfolio moves while allowing a valid reassignment', () => {
    const onSetDistrict = vi.fn()
    render(<Portfolio catalog={DATASET} decisions={[decision('M7'), decision('M4', 'almaty')]} results={null} remainingBudget={61} errorMeasureIds={new Set()} onRemove={vi.fn()} onSetDistrict={onSetDistrict} onOpenDistrict={vi.fn()} />)
    const select = screen.getByRole('combobox', { name: 'Район для M4' })
    expect(within(select).getByRole('option', { name: /Нура/ })).toBeDisabled()
    fireEvent.change(select, { target: { value: 'nura' } })
    expect(onSetDistrict).not.toHaveBeenCalled()
    fireEvent.change(select, { target: { value: 'saryarka' } })
    expect(onSetDistrict).toHaveBeenCalledExactlyOnceWith(1, 'saryarka')
  })
  it('opens the responsive catalogue through the empty slot instead of a hidden anchor', () => {
    const onRequestMeasure = vi.fn()
    render(<Portfolio catalog={DATASET} decisions={[]} results={null} remainingBudget={100} errorMeasureIds={new Set()} onRemove={vi.fn()} onSetDistrict={vi.fn()} onOpenDistrict={vi.fn()} onRequestMeasure={onRequestMeasure} />)
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать решение 1' }))
    expect(onRequestMeasure).toHaveBeenCalledTimes(1)
  })
})
