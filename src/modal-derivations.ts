import type { View, Status, StatusRef } from './types'

export function sortViewsByRecency(views: View[], recentViewIds: string[]): View[] {
  return [...views].sort((a, b) => {
    const aIndex = recentViewIds.indexOf(a.id)
    const bIndex = recentViewIds.indexOf(b.id)
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
    if (aIndex !== -1) return -1
    if (bIndex !== -1) return 1
    return 0
  })
}

export function partitionStatuses(statuses: Status[], refs: StatusRef[]): { selected: Status[]; unselected: Status[] } {
  const selected = refs
    .map((ref) => statuses.find((st) => st.slug === ref.slug && st.sourceId === ref.sourceId))
    .filter((st): st is Status => st !== undefined)
  const unselected = statuses.filter((st) => !refs.some((ref) => ref.slug === st.slug && ref.sourceId === st.sourceId))
  return { selected, unselected }
}
