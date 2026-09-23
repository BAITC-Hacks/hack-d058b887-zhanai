import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { DATASET } from './data/dataset'
import type { Decision, ExplainResponse, ImproveResponse, LeaderboardEntry } from './api/types'
import { evaluate, fallbackExplain, simulate, toActiveEvent } from './api/mock/engine'
import { draftStorageKey, emptyPlan, planReducer, writeDraft } from './state/planState'

const apiMock = vi.hoisted(() => ({
  catalog: vi.fn(), simulate: vi.fn(), explain: vi.fn(), improve: vi.fn(),
  drawEvent: vi.fn(), leaderboard: vi.fn(), submit: vi.fn(), presentation: vi.fn(),
}))
vi.mock('./api', () => ({ API_MODE: 'mock', api: apiMock }))

const example = DATASET.presets.find((preset) => preset.id === 'example')!.decisions
const noImprovement: ImproveResponse = {
  percentile: null, percentileExact: false, totalPlans: null, optimum: null, swap: null, message: 'Замена не требуется',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function activeEvent(id?: string | null) {
  const event = DATASET.events.find((item) => item.id === id)
  return event ? toActiveEvent(event) : null
}

function entry(decisions = example): LeaderboardEntry {
  const result = evaluate(decisions, null).result
  return {
    id: 'saved-team', teamName: 'Астана', score: result.score, delta: result.delta,
    criticalCount: result.criticalCount, cost: 95, decisions, eventId: null, createdAt: '2026-09-23T10:00:00Z',
  }
}

async function ready() {
  await waitFor(() => expect(screen.getByTestId('score')).toHaveTextContent('52,56'))
}

async function chooseExample(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByRole('combobox', { name: 'Готовые сценарии' }), 'example')
  await waitFor(() => expect(screen.getByTestId('score')).toHaveTextContent('56,54'))
}

beforeEach(() => {
  window.localStorage.clear()
  Object.values(apiMock).forEach((mock) => mock.mockReset())
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  apiMock.catalog.mockResolvedValue(DATASET)
  apiMock.simulate.mockImplementation(async (decisions: Decision[], eventId: string | null) => simulate(decisions, activeEvent(eventId)))
  apiMock.explain.mockImplementation(async (decisions: Decision[], eventId: string | null) => fallbackExplain(decisions, activeEvent(eventId)))
  apiMock.improve.mockResolvedValue(noImprovement)
  apiMock.leaderboard.mockResolvedValue([])
  apiMock.submit.mockResolvedValue(entry())
  apiMock.presentation.mockResolvedValue('# План')
})

describe('planning workspace', () => {
  it('changes both the budget and Score when a ready scenario is selected', async () => {
    const user = userEvent.setup()
    render(<App />)
    await ready()
    expect(screen.getByRole('progressbar', { name: 'Использование бюджета' })).toHaveAttribute('aria-valuenow', '0')
    await chooseExample(user)
    expect(screen.getByRole('progressbar', { name: 'Использование бюджета' })).toHaveAttribute('aria-valuenow', '95')
    expect(screen.getByRole('button', { name: 'Зафиксировать план' })).toBeEnabled()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Готовые сценарии' }), 'optimum')
    await waitFor(() => expect(screen.getByTestId('score')).toHaveTextContent('57,24'))
    expect(screen.getByRole('progressbar', { name: 'Использование бюджета' })).toHaveAttribute('aria-valuenow', '98')
    expect(screen.getByRole('progressbar', { name: 'Выбрано решений' })).toHaveAttribute('aria-valuenow', '5')
  })

  it('adds a measure through its district dropdown and supports reassignment and undo', async () => {
    const user = userEvent.setup()
    render(<App />)
    await ready()
    await user.click(screen.getByRole('button', { name: 'Выбрать район для M7' }))
    const selector = screen.getByRole('combobox', { name: 'Район для M7' })
    expect(selector).toHaveValue('nura')
    expect(screen.getByText('Критический показатель.', { exact: false })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Добавить в район Нура' }))
    expect(screen.getByRole('progressbar', { name: 'Использование бюджета' })).toHaveAttribute('aria-valuenow', '24')
    const portfolio = within(screen.getByRole('region', { name: 'Портфель решений' }))
    expect(portfolio.getByRole('combobox', { name: 'Район для M7' })).toHaveValue('nura')
    await user.selectOptions(portfolio.getByRole('combobox', { name: 'Район для M7' }), 'almaty')
    expect(portfolio.getByRole('combobox', { name: 'Район для M7' })).toHaveValue('almaty')
    await user.click(screen.getByRole('button', { name: 'Отменить' }))
    expect(portfolio.getByRole('combobox', { name: 'Район для M7' })).toHaveValue('nura')
    await waitFor(() => expect(apiMock.simulate).toHaveBeenLastCalledWith([{ measureId: 'M7', districtId: 'nura' }], null))
    expect(screen.getByRole('button', { name: 'Зафиксировать план' })).toBeDisabled()
  })

  it('hydrates an event and decisions together, recalculates, and preserves edits after reload', async () => {
    let saved = planReducer(emptyPlan(DATASET), { type: 'replace', decisions: example, catalog: DATASET })
    saved = planReducer(saved, { type: 'setEvent', eventId: 'winter', catalog: DATASET })
    writeDraft(saved, window.localStorage, 'mock')
    const user = userEvent.setup()
    const first = render(<App />)
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'Использование бюджета' })).toHaveAttribute('aria-valuenow', '95'))
    expect(screen.getByText(/Черновик восстановлен/)).toBeInTheDocument()
    expect(screen.getByText('Аварийная зима', { exact: true })).toBeInTheDocument()
    await waitFor(() => expect(apiMock.simulate).toHaveBeenCalledWith(example, 'winter'))
    await user.click(screen.getByRole('button', { name: 'Убрать M5' }))
    expect(screen.getByRole('progressbar', { name: 'Использование бюджета' })).toHaveAttribute('aria-valuenow', '70')
    first.unmount()
    render(<App />)
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'Выбрано решений' })).toHaveAttribute('aria-valuenow', '4'))
    expect(screen.getByText('Аварийная зима', { exact: true })).toBeInTheDocument()
    const record = JSON.parse(window.localStorage.getItem(draftStorageKey('mock'))!)
    expect(record.draft.eventId).toBe('winter')
    expect(record.draft.decisions).toHaveLength(4)
    expect(record.draft).not.toHaveProperty('score')
  })

  it('ignores late AI and improvement responses after the plan changes', async () => {
    const oldAnalysis = deferred<ExplainResponse>()
    const oldImprovement = deferred<ImproveResponse>()
    apiMock.explain.mockReturnValueOnce(oldAnalysis.promise)
    apiMock.improve.mockReturnValueOnce(oldImprovement.promise).mockResolvedValue({ ...noImprovement, message: 'Ответ для нового плана' })
    const user = userEvent.setup()
    render(<App />)
    await ready()
    await chooseExample(user)
    await waitFor(() => expect(apiMock.improve).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'Получить анализ' }))
    expect(apiMock.explain).toHaveBeenCalledTimes(1)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Готовые сценарии' }), 'optimum')
    await waitFor(() => expect(screen.getByTestId('score')).toHaveTextContent('57,24'))
    await waitFor(() => expect(apiMock.improve).toHaveBeenCalledTimes(2))
    await act(async () => {
      oldAnalysis.resolve({ ...fallbackExplain(example, null), summary: 'Устаревший анализ' })
      oldImprovement.resolve({ ...noImprovement, swap: {
        remove: example[0], add: { measureId: 'M9', districtId: 'nura' }, score: 57, delta: 0.46, cost: 81, text: 'Устаревшая замена',
      } })
    })
    expect(screen.queryByText('Устаревший анализ')).not.toBeInTheDocument()
    expect(screen.queryByText('Устаревшая замена')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Применить' })).not.toBeInTheDocument()
    expect(screen.getByText('Ответ для нового плана')).toBeInTheDocument()
    expect(screen.getByTestId('score')).toHaveTextContent('57,24')
  })

  it('submits a fixed plan once even when the form is submitted twice before completion', async () => {
    const pending = deferred<LeaderboardEntry>()
    apiMock.submit.mockReturnValueOnce(pending.promise)
    const user = userEvent.setup()
    render(<App />)
    await ready()
    await chooseExample(user)
    await user.click(screen.getByRole('button', { name: 'Зафиксировать план' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Зафиксировать план' }))
    const team = dialog.getByRole('textbox', { name: 'Название команды' })
    await user.type(team, 'Астана')
    const form = team.closest('form')!
    act(() => { fireEvent.submit(form); fireEvent.submit(form) })
    expect(apiMock.submit).toHaveBeenCalledTimes(1)
    expect(apiMock.submit).toHaveBeenCalledWith('Астана', example, null)
    expect(dialog.getByRole('button', { name: 'Записываем…' })).toBeDisabled()
    await act(async () => pending.resolve(entry()))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Зафиксировать план' })).not.toBeInTheDocument())
    for (const button of screen.getAllByRole('button', { name: 'План зафиксирован' })) expect(button).toBeDisabled()
    expect(apiMock.explain).toHaveBeenCalledTimes(1)
    expect(apiMock.submit).toHaveBeenCalledTimes(1)
  })

  it('retains the team and decisions after a failed fixation, and lets the user retry', async () => {
    apiMock.submit.mockRejectedValueOnce(new Error('Связь прервалась')).mockResolvedValueOnce(entry())
    const user = userEvent.setup()
    render(<App />)
    await ready()
    await chooseExample(user)
    await user.click(screen.getByRole('button', { name: 'Зафиксировать план' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Зафиксировать план' }))
    await user.type(dialog.getByRole('textbox', { name: 'Название команды' }), 'Астана')
    await user.click(dialog.getByRole('button', { name: 'Зафиксировать и получить анализ' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('Связь прервалась')
    expect(dialog.getByRole('textbox', { name: 'Название команды' })).toHaveValue('Астана')
    expect(screen.getByRole('progressbar', { name: 'Выбрано решений' })).toHaveAttribute('aria-valuenow', '5')
    await user.click(dialog.getByRole('button', { name: 'Зафиксировать и получить анализ' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Зафиксировать план' })).not.toBeInTheDocument())
    expect(apiMock.submit).toHaveBeenCalledTimes(2)
    expect(apiMock.explain).toHaveBeenCalledTimes(1)
  })
})
