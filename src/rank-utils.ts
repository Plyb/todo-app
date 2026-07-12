import { LexoRank } from 'lexorank'

export function rankBetween(prev: { rank: string } | null, next: { rank: string } | null): string {
  if (prev && next) return LexoRank.parse(prev.rank).between(LexoRank.parse(next.rank)).toString()
  if (prev) return LexoRank.parse(prev.rank).genNext().toString()
  if (next) return LexoRank.parse(next.rank).genPrev().toString()
  return LexoRank.middle().toString()
}

export function byRank<T extends { rank: string }>(a: T, b: T): number {
  return a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0
}

export function byStringKey<T extends Record<K, string>, K extends string>(key: K): (a: T, b: T) => number {
  return (a: T, b: T) => a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0
}
