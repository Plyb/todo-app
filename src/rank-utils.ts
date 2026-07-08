import { LexoRank } from 'lexorank'
import type { Task } from './tasks'

export function rankBetween(prev: Task | null, next: Task | null): string {
  if (prev && next) return LexoRank.parse(prev.rank).between(LexoRank.parse(next.rank)).toString()
  if (prev) return LexoRank.parse(prev.rank).genNext().toString()
  if (next) return LexoRank.parse(next.rank).genPrev().toString()
  return LexoRank.middle().toString()
}
