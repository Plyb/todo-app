import { describe, expect, it } from 'vitest'
import { findInsertIndex, isPrimaryButton } from './pointer-utils'

function fakeElement(top: number, height: number): HTMLElement {
  return {
    getBoundingClientRect: () => ({ top, height }) as DOMRect,
  } as unknown as HTMLElement
}

describe('findInsertIndex', () => {
  const elements = [fakeElement(0, 20), fakeElement(20, 20), fakeElement(40, 20)]

  it('returns 0 when the probe is above the first item midpoint', () => {
    expect(findInsertIndex(elements, 5)).toBe(0)
  })

  it('returns the index of the item whose midpoint the probe is just above', () => {
    // Item 1 spans [20, 40), midpoint 30; probe at 25 is above that midpoint.
    expect(findInsertIndex(elements, 25)).toBe(1)
  })

  it('returns elements.length when the probe is past the last item midpoint', () => {
    expect(findInsertIndex(elements, 999)).toBe(elements.length)
  })

  it('returns 0 for an empty list', () => {
    expect(findInsertIndex([], 10)).toBe(0)
  })
})

describe('isPrimaryButton', () => {
  it('returns true for the primary (left) button', () => {
    expect(isPrimaryButton({ button: 0 } as PointerEvent)).toBe(true)
  })

  it('returns false for non-primary buttons', () => {
    expect(isPrimaryButton({ button: 1 } as PointerEvent)).toBe(false)
    expect(isPrimaryButton({ button: 2 } as PointerEvent)).toBe(false)
  })
})
