import { describe, expect, it } from 'vitest'
import { isUserDefinedView, ARCHIVE_VIEW } from './synthetic-view-utils'
import type { View } from './types'

describe('isUserDefinedView', () => {
  it('is true for a real, user-defined view', () => {
    const view: View = { slug: 'real-view', name: 'Real View', statusSlugs: [] }
    expect(isUserDefinedView(view)).toBe(true)
  })

  it('is false for the synthetic archive view', () => {
    expect(isUserDefinedView(ARCHIVE_VIEW)).toBe(false)
  })
})
