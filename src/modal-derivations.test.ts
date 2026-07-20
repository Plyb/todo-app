import { describe, expect, it } from 'vitest'
import { sortViewsByRecency, partitionStatuses } from './modal-derivations'
import type { View, Status } from './types'

function makeView(id: string): View {
  return { id, name: id, statusSlugs: [] }
}

describe('sortViewsByRecency', () => {
  it('leaves order unchanged when recentViewIds is empty', () => {
    const views = [makeView('a'), makeView('b'), makeView('c')]

    expect(sortViewsByRecency(views, [])).toEqual(views)
  })

  it('orders recent views by their position in recentViewIds', () => {
    const a = makeView('a')
    const b = makeView('b')
    const c = makeView('c')

    const result = sortViewsByRecency([a, b, c], ['c', 'a', 'b'])

    expect(result).toEqual([c, a, b])
  })

  it('places recent views before non-recent views', () => {
    const a = makeView('a')
    const b = makeView('b')
    const c = makeView('c')

    const result = sortViewsByRecency([a, b, c], ['b'])

    expect(result).toEqual([b, a, c])
  })

  it('does not mutate the input array', () => {
    const views = [makeView('a'), makeView('b')]

    sortViewsByRecency(views, ['b'])

    expect(views).toEqual([makeView('a'), makeView('b')])
  })
})

describe('partitionStatuses', () => {
  const backlog: Status = { slug: 'backlog', name: 'Backlog' }
  const doing: Status = { slug: 'doing', name: 'Doing' }
  const done: Status = { slug: 'done', name: 'Done' }
  const statuses = [backlog, doing, done]

  it('puts everything in unselected when slugs is empty', () => {
    expect(partitionStatuses(statuses, [])).toEqual({ selected: [], unselected: statuses })
  })

  it('puts everything in selected, in slug order, when all slugs are selected', () => {
    const result = partitionStatuses(statuses, ['done', 'backlog', 'doing'])

    expect(result).toEqual({ selected: [done, backlog, doing], unselected: [] })
  })

  it('splits statuses between selected and unselected', () => {
    const result = partitionStatuses(statuses, ['doing'])

    expect(result).toEqual({ selected: [doing], unselected: [backlog, done] })
  })

  it('omits slugs that do not match any status', () => {
    const result = partitionStatuses(statuses, ['doing', 'missing'])

    expect(result).toEqual({ selected: [doing], unselected: [backlog, done] })
  })
})
