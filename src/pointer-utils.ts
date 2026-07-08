export function isPrimaryButton(e: PointerEvent | React.PointerEvent): boolean {
  return e.button === 0
}

export function findInsertIndex(elements: HTMLElement[], probeY: number): number {
  for (let i = 0; i < elements.length; i++) {
    const rect = elements[i].getBoundingClientRect()
    if (probeY < rect.top + rect.height / 2) return i
  }
  return elements.length
}
