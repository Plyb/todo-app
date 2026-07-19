import type { ArchivedView, UserDefinedView, View } from './types'

export const ARCHIVE_VIEW_SLUG: ArchivedView['slug'] = '__archived__'

export const ARCHIVE_VIEW: ArchivedView = {
  slug: ARCHIVE_VIEW_SLUG,
  name: 'Archive',
}

export function isKnownViewSlug(slug: string, views: View[]): boolean {
  return slug === ARCHIVE_VIEW_SLUG || views.some((v) => v.slug === slug)
}

export function isUserDefinedView(view: View): view is UserDefinedView {
  return view.slug !== ARCHIVE_VIEW_SLUG
}
