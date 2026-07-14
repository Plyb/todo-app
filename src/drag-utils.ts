function locateItem<T extends { id: number }>(
  sections: { items: T[] }[],
  id: number
): { sectionIndex: number; itemIndex: number } {
  const sectionIndex = sections.findIndex((s) => s.items.some((t) => t.id === id))
  const itemIndex = sections[sectionIndex].items.findIndex((t) => t.id === id)
  return { sectionIndex, itemIndex }
}

export function resolveReorder<T extends { id: number }>(
  sections: { items: T[] }[],
  activeId: number,
  overId: number
): { toSectionIndex: number; insertIndex: number } {
  const { sectionIndex: toSectionIndex, itemIndex: overIndex } = locateItem(sections, overId)
  const toSection = sections[toSectionIndex]
  const { sectionIndex: fromSectionIndex, itemIndex: oldIndex } = locateItem(sections, activeId)

  let insertIndex: number
  if (fromSectionIndex === toSectionIndex) {
    const others = toSection.items.filter((t) => t.id !== activeId)
    const othersOverIndex = others.findIndex((t) => t.id === overId)
    // dragging down → insert after over; dragging up → insert before over
    insertIndex = oldIndex < overIndex ? othersOverIndex + 1 : othersOverIndex
  } else {
    // cross-section: dragged item is not in target section, insert before the over item
    insertIndex = overIndex
  }

  return { toSectionIndex, insertIndex }
}
