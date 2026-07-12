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
