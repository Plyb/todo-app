import { LexoRank } from 'lexorank'
import type { Task } from './types'
import { byRank } from './rank-utils'

// Once a rank string reaches this length, repeated inserts between the same
// two neighbors have made it long enough to warrant re-ranking (issue #93).
export const RERANK_RANK_LENGTH_THRESHOLD = 30

export function needsRerank(tasks: Task[]): boolean {
  return tasks.some((t) => t.archivedAt === null && t.rank.length >= RERANK_RANK_LENGTH_THRESHOLD)
}

// Reassigns a fresh, evenly-spaced sequence of ranks to the non-archived tasks
// in a single status group, preserving their current relative order. Archived
// tasks are excluded entirely (no rank, and no gap left for them).
export function rerankStatusGroup(tasks: Task[]): { id: number; rank: string }[] {
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
