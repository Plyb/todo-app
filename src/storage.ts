import { useState } from 'react'
import type { Task } from './types'

export function readJSON<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJSON<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

const CURRENT_VIEW_ID_KEY = 'currentViewId'
const RECENT_VIEW_IDS_KEY = 'recentViewIds'

export function readCurrentViewId(): string | null {
  return localStorage.getItem(CURRENT_VIEW_ID_KEY)
}

export function writeCurrentViewId(id: string): void {
  localStorage.setItem(CURRENT_VIEW_ID_KEY, id)
}

export function readRecentViewIds(): string[] {
  return readJSON<string[]>(RECENT_VIEW_IDS_KEY, [])
}

export function writeRecentViewIds(ids: string[]): void {
  writeJSON(RECENT_VIEW_IDS_KEY, ids)
}

const AUTO_ARCHIVE_ENABLED_KEY = 'auto-archive-enabled'

export function getAutoArchiveEnabled(): boolean {
  return localStorage.getItem(AUTO_ARCHIVE_ENABLED_KEY) === 'true'
}

export function setAutoArchiveEnabled(enabled: boolean): void {
  localStorage.setItem(AUTO_ARCHIVE_ENABLED_KEY, String(enabled))
}

export const VIEW_SELECTOR_VISIBILITY_KEY = 'view-selector-button-visibility'

export const SELECTED_SOURCE_ID_KEY = 'selected-source-id'

export function readSelectedSourceId(): string | null {
  return localStorage.getItem(SELECTED_SOURCE_ID_KEY)
}

export function useLocalStorageSetting<T extends string>(key: string): [T | null, (value: T | null) => void] {
  const [value, setValue] = useState<T | null>(() => localStorage.getItem(key) as T | null)
  const setAndPersist = (next: T | null) => {
    setValue(next)
    if (next === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, next)
    }
  }
  return [value, setAndPersist]
}

export function selectableTasks(allTasks: Task[], opts: { currentTaskId: number; excludedIds?: Set<number> }): Task[] {
  return allTasks.filter((t) =>
    t.id !== opts.currentTaskId &&
    !opts.excludedIds?.has(t.id) &&
    t.archivedAt === null
  )
}
