import type { ArchivedView, UserDefinedView, View } from './types'

export const ARCHIVE_VIEW_ID: ArchivedView['id'] = '__archived__'

export const ARCHIVE_VIEW: ArchivedView = {
  id: ARCHIVE_VIEW_ID,
  name: 'Archive',
}

export function isUserDefinedView(view: View): view is UserDefinedView {
  return view.id !== ARCHIVE_VIEW_ID
}
