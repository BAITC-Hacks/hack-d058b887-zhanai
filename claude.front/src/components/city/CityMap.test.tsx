import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DistrictResult, IndicatorValues } from '../../api'
import { DATASET, type Decision, type DistrictId } from '../../data/dataset'
import { writeMeasureDrag } from '../../lib/measureDrag'
import { CityMap } from './CityMap'

const values = Object.fromEntries(DATASET.districts.map((district) => [district.id, district.indicators])) as Record<DistrictId, IndicatorValues>
const districts: DistrictResult[] = DATASET.districts.map((district) => ({
  districtId: district.id,
  beforeScore: district.id === 'nura' ? 49.2 : 57,
  afterScore: district.id === 'nura' ? 53 : 58,
  beforeIndicators: district.indicators,
  afterIndicators: district.indicators,
  criticalBefore: district.id === 'nura' ? ['S1', 'S2'] : [],
  criticalAfter: [],
}))

function transfer(measureId: string) {
  const values = new Map<string, string>()
  const data: Pick<DataTransfer, 'effectAllowed' | 'dropEffect' | 'setData' | 'getData'> = {
    effectAllowed: 'none', dropEffect: 'none',
    setData: (type, value) => { values.set(type, value) },
    getData: (type) => values.get(type) ?? '',
  }
  writeMeasureDrag(data, measureId)
  return data
}

function map(overrides: Partial<React.ComponentProps<typeof CityMap>> = {}) {
  const onSelect = vi.fn()
  const onDropMeasure = vi.fn()
  const view = render(<CityMap
    catalog={DATASET} districts={districts} showAfter={true} selected={null}
    onSelect={onSelect} onDropMeasure={onDropMeasure}
    currentValues={values} {...overrides}
  />)
  const svg = view.container.querySelector('[data-city-map="true"]')!
  return { ...view, svg, onSelect, onDropMeasure }
}

describe('Astana district map integration', () => {
  it('shows five distinct detailed Astana contours, current deltas and map attribution', () => {
    const { svg, container } = map()
    const shapes = [...svg.querySelectorAll('g[data-district-id]')]
    expect(shapes.map((shape) => shape.getAttribute('data-district-id')).sort())
      .toEqual(DATASET.districts.map((district) => district.id).sort())
    const paths = shapes.map((shape) => shape.querySelector('path')?.getAttribute('d'))
    expect(paths.every((path) => path && path.startsWith('M') && path.length > 400)).toBe(true)
    expect(new Set(paths).size).toBe(5)
    expect(svg.querySelectorAll('polygon')).toHaveLength(0)
    expect(container.querySelectorAll('.scheme-map-pill')).toHaveLength(5)
    expect(container.querySelector('.scheme-map-labels')?.textContent).toMatch(/49,2 → 53,0/)
    const attribution = screen.getByRole('link', { name: /OpenStreetMap/i })
    expect(attribution).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
  })

  it('keeps each district selectable by keyboard and names critical values in text', () => {
    const { svg, onSelect } = map({ showAfter: false })
    const nura = svg.querySelector('[data-district-id="nura"]')!
    expect(nura).toHaveAttribute('role', 'button')
    expect(nura).toHaveAttribute('tabindex', '0')
    expect(nura).toHaveAttribute('aria-label', expect.stringContaining('критических показателей 2'))
    expect(screen.getByText(/2 критич\./, { selector: '.scheme-map-note' })).toBeInTheDocument()
    fireEvent.keyDown(nura, { key: 'Enter' })
    fireEvent.keyDown(nura, { key: ' ' })
    expect(onSelect).toHaveBeenNthCalledWith(1, 'nura')
    expect(onSelect).toHaveBeenNthCalledWith(2, 'nura')
  })

  it('uses the exact Astana Scheme district palette and its selected pill style', () => {
    const baseline = map({ showAfter: false })
    expect(baseline.svg.querySelector('[data-district-id="nura"] path')).toHaveAttribute('fill', '#F0C9C4')
    expect(baseline.svg.querySelector('[data-district-id="esil"] path')).toHaveAttribute('fill', '#BFD8E4')
    baseline.unmount()

    const changed = map()
    expect(changed.svg.querySelector('[data-district-id="nura"] path')).not.toHaveAttribute('fill', '#F0C9C4')
    changed.unmount()

    const selected = map({ showAfter: false, selected: 'nura' })
    expect(selected.svg.querySelector('[data-district-id="nura"] path')).toHaveAttribute('fill', '#A4463F')
    expect(selected.container.querySelectorAll('.scheme-map-label.is-selected')).toHaveLength(1)
    expect(selected.container.querySelector('.scheme-map-label.is-selected .scheme-map-pill')).toHaveTextContent('Нура')
  })

  it('routes valid district and city drops once, and rejects local conflicts', () => {
    const nuraDecision: Decision = { measureId: 'M7', districtId: 'nura' }
    const first = map({ draggedMeasureId: 'M7' })
    const nura = first.svg.querySelector('[data-district-id="nura"]')!
    expect(nura).toHaveAttribute('data-drop-state', 'allowed')
    fireEvent.drop(nura, { dataTransfer: transfer('M7') })
    expect(first.onDropMeasure).toHaveBeenCalledExactlyOnceWith('M7', 'nura')
    first.unmount()

    const blocked = map({ draggedMeasureId: 'M4', decisions: [nuraDecision], remainingBudget: 76 })
    const blockedNura = blocked.svg.querySelector('[data-district-id="nura"]')!
    expect(blockedNura).toHaveAttribute('data-drop-state', 'blocked')
    fireEvent.drop(blockedNura, { dataTransfer: transfer('M4') })
    expect(blocked.onDropMeasure).not.toHaveBeenCalled()
    blocked.unmount()

    const city = map({ draggedMeasureId: 'M12' })
    fireEvent.drop(city.svg.querySelector('[data-district-id="nura"]')!, { dataTransfer: transfer('M12') })
    expect(city.onDropMeasure).toHaveBeenCalledExactlyOnceWith('M12', null)
  })
})
