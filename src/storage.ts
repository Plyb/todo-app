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

const CURRENT_VIEW_SLUG_KEY = 'currentViewSlug'
const RECENT_VIEW_SLUGS_KEY = 'recentViewSlugs'

export function readCurrentViewSlug(): string | null {
  return localStorage.getItem(CURRENT_VIEW_SLUG_KEY)
}

export function writeCurrentViewSlug(slug: string): void {
  localStorage.setItem(CURRENT_VIEW_SLUG_KEY, slug)
}

export function readRecentViewSlugs(): string[] {
  return readJSON<string[]>(RECENT_VIEW_SLUGS_KEY, [])
}

export function writeRecentViewSlugs(slugs: string[]): void {
  writeJSON(RECENT_VIEW_SLUGS_KEY, slugs)
}

const AUTO_ARCHIVE_SLUG_KEY = 'auto-archive-status-slug'

export function getAutoArchiveSlug(): string | null {
  return localStorage.getItem(AUTO_ARCHIVE_SLUG_KEY)
}

export function setAutoArchiveSlug(slug: string | null): void {
  if (slug === null) {
    localStorage.removeItem(AUTO_ARCHIVE_SLUG_KEY)
  } else {
    localStorage.setItem(AUTO_ARCHIVE_SLUG_KEY, slug)
  }
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
  const autoArchiveSlug = getAutoArchiveSlug()
  return allTasks.filter((t) =>
    t.id !== opts.currentTaskId &&
    !opts.excludedIds?.has(t.id) &&
    t.statusSlug !== autoArchiveSlug
  )
}
