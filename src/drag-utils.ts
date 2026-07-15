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

const SECTION_DROP_ID_PREFIX = 'section-drop-'

// Each section's container is registered as its own droppable (see
// DraggableList's use of useDroppable) so that dragging into a section plays
// nice even when there's nothing inside it for dnd-kit to register a
// per-item drop target on.
export function toSectionDropId(sectionIndex: number): string {
  return `${SECTION_DROP_ID_PREFIX}${sectionIndex}`
}

function parseSectionDropId(id: number | string): number | null {
  if (typeof id !== 'string' || !id.startsWith(SECTION_DROP_ID_PREFIX)) return null
  const sectionIndex = Number(id.slice(SECTION_DROP_ID_PREFIX.length))
  return Number.isInteger(sectionIndex) ? sectionIndex : null
}

// Resolves a dnd-kit `over.id` (from onDragOver/onDragEnd) into a target
// section + insert index. `overId` is either a real item id (the normal
// case, delegated to resolveReorder) or a section-container id produced by
// toSectionDropId (hovering/dropping on a section's empty space), which
// always means "place at the end of that section". Returns null when there
// is no meaningful drop (e.g. hovering the dragged item itself).
export function resolveDrop<T extends { id: number }>(
  sections: { items: T[] }[],
  activeId: number,
  overId: number | string
): { toSectionIndex: number; insertIndex: number } | null {
  const sectionIndex = parseSectionDropId(overId)
  if (sectionIndex !== null) {
    return { toSectionIndex: sectionIndex, insertIndex: sections[sectionIndex].items.length }
  }

  const overItemId = typeof overId === 'number' ? overId : Number(overId)
  if (overItemId === activeId) return null

  return resolveReorder(sections, activeId, overItemId)
}

// Produces a new sections array with `activeId` relocated to
// (toSectionIndex, insertIndex). Used to build a live preview of where the
// dragged item would land while hovering, since dnd-kit only plays its
// "space opening" shift animation for items it considers part of the same
// sortable list as the active drag — so the item actually has to be present
// in the target section's rendered items during the hover, not just at drop.
export function moveItemToSection<T extends { id: number }>(
  sections: { items: T[] }[],
  activeId: number,
  toSectionIndex: number,
  insertIndex: number
): { items: T[] }[] {
  const { sectionIndex: fromSectionIndex, itemIndex } = locateItem(sections, activeId)
  const activeItem = sections[fromSectionIndex].items[itemIndex]

  return sections.map((section, i) => {
    const items = section.items.filter((t) => t.id !== activeId)
    if (i === toSectionIndex) items.splice(insertIndex, 0, activeItem)
    return { ...section, items }
  })
}
