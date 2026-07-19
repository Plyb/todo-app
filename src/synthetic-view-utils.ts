import type { View } from './types'

export const ARCHIVE_VIEW_SLUG = '__archived__'

export const ARCHIVE_VIEW: View = {
  slug: ARCHIVE_VIEW_SLUG,
  name: 'Archive',
  statusSlugs: [],
}

export function isKnownViewSlug(slug: string, views: View[]): boolean {
  return slug === ARCHIVE_VIEW_SLUG || views.some((v) => v.slug === slug)
}
