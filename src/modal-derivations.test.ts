import { describe, expect, it } from 'vitest'
import { sortViewsByRecency, partitionStatuses } from './modal-derivations'
import type { View, Status, StatusRef } from './types'

function makeView(id: string): View {
  return { id, name: id, statusRefs: [] }
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
  const backlog: Status = { slug: 'backlog', name: 'Backlog', sourceId: 'indexeddb' }
  const doing: Status = { slug: 'doing', name: 'Doing', sourceId: 'indexeddb' }
  const done: Status = { slug: 'done', name: 'Done', sourceId: 'indexeddb' }
  const statuses = [backlog, doing, done]

  function ref(status: Status): StatusRef {
    return { slug: status.slug, sourceId: status.sourceId }
  }

  it('puts everything in unselected when refs is empty', () => {
    expect(partitionStatuses(statuses, [])).toEqual({ selected: [], unselected: statuses })
  })

  it('puts everything in selected, in ref order, when all refs are selected', () => {
    const result = partitionStatuses(statuses, [ref(done), ref(backlog), ref(doing)])

    expect(result).toEqual({ selected: [done, backlog, doing], unselected: [] })
  })

  it('splits statuses between selected and unselected', () => {
    const result = partitionStatuses(statuses, [ref(doing)])

    expect(result).toEqual({ selected: [doing], unselected: [backlog, done] })
  })

  it('omits refs that do not match any status', () => {
    const result = partitionStatuses(statuses, [ref(doing), { slug: 'missing', sourceId: 'indexeddb' }])

    expect(result).toEqual({ selected: [doing], unselected: [backlog, done] })
  })

  it('does not match a ref whose slug is shared by a status in a different source', () => {
    const result = partitionStatuses(statuses, [{ slug: 'doing', sourceId: 'other-source' }])

    expect(result).toEqual({ selected: [], unselected: statuses })
  })
})
