// Режим mock: всё считается в браузере, чтобы интерфейс можно было развивать
// и показывать без сервера. Небольшие задержки имитируют сеть, чтобы состояния
// загрузки были видны и отлажены.

import { DATASET } from '../../data/dataset'
import type { Api, ActiveEvent, Decision, LeaderboardEntry } from '../types'
import { KNOWN_OPTIMUM, bestSwap, evaluate, fallbackExplain, presentationMarkdown, simulate, toActiveEvent, validate } from './engine'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const LB_KEY = 'akim.leaderboard.v1'

function eventById(id?: string | null): ActiveEvent | null {
  if (!id) return null
  const e = DATASET.events.find((x) => x.id === id)
  return e ? toActiveEvent(e) : null
}

function readLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LB_KEY)
    return raw ? (JSON.parse(raw) as LeaderboardEntry[]) : []
  } catch {
    return []
  }
}

function writeLeaderboard(entries: LeaderboardEntry[]) {
  try {
    localStorage.setItem(LB_KEY, JSON.stringify(entries))
  } catch {
    /* приватный режим или заблокированное хранилище: лидерборд живёт только в памяти */
  }
}

let memoryLeaderboard: LeaderboardEntry[] | null = null

export const mockApi: Api = {
  async catalog() {
    return DATASET
  },

  async simulate(decisions, eventId) {
    await wait(60)
    return simulate(decisions, eventById(eventId))
  },

  async explain(decisions, eventId) {
    await wait(900)
    return fallbackExplain(decisions, eventById(eventId))
  },

  async improve(decisions, eventId) {
    await wait(250)
    const event = eventById(eventId)
    if (validate(decisions, event?.budget ?? DATASET.rules.budget).length) {
      return { percentile: null, percentileExact: false, totalPlans: null, optimum: null, swap: null, message: 'Сначала соберите допустимый план из пяти мер' }
    }
    const swap = bestSwap(decisions, event)
    return {
      percentile: null,
      percentileExact: false,
      totalPlans: null,
      optimum: event ? null : { decisions: KNOWN_OPTIMUM.decisions, score: KNOWN_OPTIMUM.score, cost: KNOWN_OPTIMUM.cost },
      swap,
      message: swap ? null : 'Замена одной меры не улучшает план',
    }
  },

  async drawEvent(excludeId) {
    await wait(400)
    const pool = DATASET.events.filter((e) => e.id !== excludeId)
    return toActiveEvent(pool[Math.floor(Math.random() * pool.length)])
  },

  async leaderboard() {
    await wait(80)
    memoryLeaderboard ??= readLeaderboard()
    return [...memoryLeaderboard].sort((a, b) => b.score - a.score)
  },

  async submit(teamName, decisions, eventId) {
    await wait(200)
    const event = eventById(eventId)
    if (event) throw new Error('Рейтинг сравнивает планы без событий, при одинаковых исходных условиях')
    const name = teamName.trim().replace(/\s+/g, ' ')
    if (!name || name.length > 40) throw new Error('Введите название команды от 1 до 40 символов')
    if (validate(decisions, DATASET.rules.budget).length) throw new Error('План недопустим, в лидерборд не записан')
    const { result } = evaluate(decisions, event)
    const entry: LeaderboardEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      teamName: name,
      score: result.score,
      delta: result.delta,
      cost: decisions.reduce((a, d) => a + (DATASET.measures.find((m) => m.id === d.measureId)?.cost ?? 0), 0),
      criticalCount: result.criticalCount,
      decisions: decisions.map((d) => ({ ...d })),
      eventId: null,
      createdAt: new Date().toISOString(),
    }
    memoryLeaderboard ??= readLeaderboard()
    memoryLeaderboard = [...memoryLeaderboard.filter(saved => saved.teamName !== name), entry]
    writeLeaderboard(memoryLeaderboard)
    return entry
  },

  async presentation(decisions, eventId) {
    await wait(150)
    return presentationMarkdown(decisions, eventById(eventId))
  },
}

export type { Decision }
