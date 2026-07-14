import type { View, Status } from './types'

export function sortViewsByRecency(views: View[], recentViewSlugs: string[]): View[] {
  return [...views].sort((a, b) => {
    const aIndex = recentViewSlugs.indexOf(a.slug)
    const bIndex = recentViewSlugs.indexOf(b.slug)
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
    if (aIndex !== -1) return -1
    if (bIndex !== -1) return 1
    return 0
  })
}

export function partitionStatuses(statuses: Status[], slugs: string[]): { selected: Status[]; unselected: Status[] } {
  const selected = slugs
    .map((s) => statuses.find((st) => st.slug === s))
    .filter((st): st is Status => st !== undefined)
  const unselected = statuses.filter((st) => !slugs.includes(st.slug))
  return { selected, unselected }
}
