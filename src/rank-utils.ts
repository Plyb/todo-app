import { LexoRank } from 'lexorank'

export function rankBetween(prev: { rank: string } | null, next: { rank: string } | null): string {
  if (prev && next) return LexoRank.parse(prev.rank).between(LexoRank.parse(next.rank)).toString()
  if (prev) return LexoRank.parse(prev.rank).genNext().toString()
  if (next) return LexoRank.parse(next.rank).genPrev().toString()
  return LexoRank.middle().toString()
}
