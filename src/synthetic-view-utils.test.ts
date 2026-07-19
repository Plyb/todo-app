import { describe, expect, it } from 'vitest'
import { isKnownViewSlug, ARCHIVE_VIEW_SLUG } from './synthetic-view-utils'
import type { View } from './types'

describe('isKnownViewSlug', () => {
  const views: View[] = [{ slug: 'real-view', name: 'Real View', statusSlugs: [] }]

  it('treats the archive sentinel slug as known even though it is never in the views array', () => {
    expect(isKnownViewSlug(ARCHIVE_VIEW_SLUG, views)).toBe(true)
  })

  it('treats a real view slug as known when present in the views array', () => {
    expect(isKnownViewSlug('real-view', views)).toBe(true)
  })

  it('treats an unrecognized slug as unknown', () => {
    expect(isKnownViewSlug('stale-slug', views)).toBe(false)
  })
})
