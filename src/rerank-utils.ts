import { LexoRank } from 'lexorank'
import type { Task } from './types'
import { byRank } from './rank-utils'

export const RERANK_RANK_LENGTH_THRESHOLD = 30

export function needsRerank(tasks: Task[]): boolean {
  return tasks.some((t) => t.archivedAt === null && t.rank.length >= RERANK_RANK_LENGTH_THRESHOLD)
}

export function rerankStatusGroup(tasks: Task[]): { id: number; rank: string }[] {
  // Archived tasks get no rank and no reserved gap in the sequence.
  const nonArchived = tasks.filter((t) => t.archivedAt === null).sort(byRank)
  if (nonArchived.length === 0) return []

  let rank = LexoRank.middle()
  const reranked = [{ id: nonArchived[0].id, rank: rank.toString() }]
  for (const task of nonArchived.slice(1)) {
    rank = rank.genNext()
    reranked.push({ id: task.id, rank: rank.toString() })
  }
  return reranked
}
