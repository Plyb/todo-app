import type { TaskSource } from './types'

// The DB behind a source only ever holds that source's own records, so
// sourceId is attached to reads / stripped from writes at the adapter
// boundary (e.g. IndexedDbSource) rather than persisted.
export function withSourceId<T extends object>(item: T, sourceId: string): T & { sourceId: string } {
  return { ...item, sourceId }
}

export function stripSourceId<T extends { sourceId: string }>(item: T): Omit<T, 'sourceId'> {
  const { sourceId, ...rest } = item
  void sourceId
  return rest
}

export function sourceOf<T extends { sourceId: string }>(
  item: T,
  getSource: (id: string) => TaskSource,
): TaskSource {
  return getSource(item.sourceId)
}

export function groupBySourceId<T extends { sourceId: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const group = groups.get(item.sourceId)
    if (group) group.push(item)
    else groups.set(item.sourceId, [item])
  }
  return groups
}

export async function loadAcrossSources<T>(
  sources: TaskSource[],
  load: (source: TaskSource) => Promise<T[]>,
): Promise<T[]> {
  const results = await Promise.all(sources.map(load))
  return results.flat()
}
