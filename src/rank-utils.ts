import { LexoRank } from 'lexorank'
import type { Task } from './types'

export function rankBetween(prev: { rank: string } | null, next: { rank: string } | null): string {
  if (prev && next) return LexoRank.parse(prev.rank).between(LexoRank.parse(next.rank)).toString()
  if (prev) return LexoRank.parse(prev.rank).genNext().toString()
  if (next) return LexoRank.parse(next.rank).genPrev().toString()
  return LexoRank.middle().toString()
}

export function rankAtInsertIndex(tasks: Task[], insertIndex: number, excludeId?: number): string {
  const candidates = excludeId === undefined ? tasks : tasks.filter((t) => t.id !== excludeId)
  const prev = insertIndex > 0 ? candidates[insertIndex - 1] : null
  const next = insertIndex < candidates.length ? candidates[insertIndex] : null
  return rankBetween(prev, next)
}

export function byStringKey<K extends string>(key: K) {
  return <T extends Record<K, string>>(a: T, b: T): number =>
    a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0
}

export const byRank = byStringKey('rank')
