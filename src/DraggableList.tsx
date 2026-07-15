import React, { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { theme } from './theme'
import { locateItem, resolveDrop, moveItemToSection, toSectionDropId } from './drag-utils'
import { findInsertIndex } from './pointer-utils'

const MOUSE_DRAG_ACTIVATION_PX = 8
const TOUCH_DRAG_DELAY_MS = 400
const TOUCH_DRAG_TOLERANCE_PX = 8
// The very last section's container has no dead space below its own items to
// register a drop target on (padding/margin are both 0), so there's nowhere
// to drop "at the end of the list" without landing exactly on the last item.
// This reserves some of that space as part of the last section's own
// droppable rect instead.
const LAST_SECTION_DROP_TAIL_HEIGHT = 96

function toItemId(id: UniqueIdentifier): number {
  return typeof id === 'number' ? id : Number(id)
}

// Every section's own container is registered as a droppable alongside its
// items (see SectionList), so a single item can simultaneously sit "within"
// both its item-level droppable and the enclosing section's much larger
// container droppable. `closestCenter` picks whichever droppable's CENTER is
// nearest the dragged item's center — since a section container spans every
// item in it, its center is the section's overall midpoint, which can end up
// closer than the specific hovered item's own (much smaller) center,
// especially mid-section. That made the empty-section/"section index"
// branch fire even while hovering a real item, unpredictably depending on
// section length and hover position.
// `pointerWithin` instead only considers droppables whose rect the pointer
// coordinate literally falls inside, then breaks ties by distance to that
// rect's corners. An item rect is much smaller/tighter around the pointer
// than its enclosing section rect, so its corner-distance is naturally
// smaller too — items win over their own container whenever the pointer is
// actually over one. Falls back to `rectIntersection` (dnd-kit's own
// default) for the rare case for gaps pointerWithin misses entirely (e.g.
// margins between sections).
const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args)
  return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args)
}

export function getInsertSlotAt(container: HTMLElement, clientY: number): { sectionIndex: number; index: number } {
  const sectionEls = Array.from(container.querySelectorAll<HTMLElement>('[data-section-index]'))
  if (sectionEls.length === 0) return { sectionIndex: 0, index: 0 }
  let sectionIndex = sectionEls.length - 1
  for (let i = 0; i < sectionEls.length; i++) {
    if (clientY < sectionEls[i].getBoundingClientRect().bottom) {
      sectionIndex = i
      break
    }
  }
  const listItems = Array.from(
    sectionEls[sectionIndex].querySelectorAll<HTMLElement>('li:not([data-insert-slot])')
  )
  return { sectionIndex, index: findInsertIndex(listItems, clientY) }
}

type Section<T> = {
  header?: React.ReactNode
  items: T[]
}

type DraggableListProps<T extends { id: number }> = {
  sections: Section<T>[]
  onReorder: (draggedId: number, toSectionIndex: number, insertIndex: number) => void
  renderItem: (item: T) => React.ReactNode
  itemStyle?: (item: T) => React.CSSProperties
  onItemClick?: (id: number) => void
  insertSlot?: { index: number; sectionIndex: number; content: React.ReactNode }
  expandedSlot?: { afterItemId: number; content: React.ReactNode }
  listRef?: React.RefObject<HTMLDivElement | null>
  onDragStart?: () => void
  onDragEnd?: () => void
}

function SortableItem<T extends { id: number }>({
  item,
  renderItem,
  itemStyle,
  onItemClick,
}: {
  item: T
  renderItem: (item: T) => React.ReactNode
  itemStyle?: (item: T) => React.CSSProperties
  onItemClick?: (id: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    // dnd-kit's default layout-change animation causes items to snap back to
    // their pre-drop position and then transition again once the reordered
    // data arrives, doubling the movement. The drag-preview transform (shown
    // while dragging) is unaffected by this and keeps animating normally.
    //
    // Nuance: this only ever suppresses the POST-drop settle animation, not
    // the live "space opening" shift while hovering during an active drag.
    // dnd-kit's own getTransition() applies the CSS transition whenever
    // `isSorting` is true (i.e. any drag is active anywhere in this
    // DndContext) regardless of what animateLayoutChanges returns — it's
    // only consulted once a drag ends. So disabling it unconditionally here
    // doesn't kill the cross-section hover animation; what was actually
    // missing was getting the dragged item into the target section's
    // `items` list during hover in the first place (see handleDragOver /
    // moveItemToSection below), since dnd-kit only computes a shift
    // transform for items it considers part of the same sortable list as
    // the active drag.
    animateLayoutChanges: () => false,
  })

  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation()
        if (!isDragging) onItemClick?.(item.id)
      }}
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        padding: '12px 16px',
        borderBottom: `1px solid ${theme.colors.divider}`,
        boxSizing: 'border-box',
        position: 'relative',
        ...itemStyle?.(item),
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0 : undefined,
        zIndex: isDragging ? 0 : 1,
      }}
    >
      {renderItem(item)}
    </li>
  )
}

function SectionList<T extends { id: number }>({
  section,
  sectionIndex,
  isLastSection,
  renderItem,
  itemStyle,
  onItemClick,
  insertSlot,
  expandedSlot,
}: {
  section: Section<T>
  sectionIndex: number
  isLastSection: boolean
  renderItem: (item: T) => React.ReactNode
  itemStyle?: (item: T) => React.CSSProperties
  onItemClick?: (id: number) => void
  insertSlot?: DraggableListProps<T>['insertSlot']
  expandedSlot?: DraggableListProps<T>['expandedSlot']
}) {
  // Registers the section's own container as a droppable target (in
  // addition to its individual items) so dragging into it resolves to a
  // valid `over` even when the section has no items to register per-item
  // drop targets of its own.
  const { setNodeRef } = useDroppable({ id: toSectionDropId(sectionIndex) })

  return (
    <ul
      ref={setNodeRef}
      data-section-index={sectionIndex}
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        paddingBottom: isLastSection ? LAST_SECTION_DROP_TAIL_HEIGHT : 0,
        position: 'relative',
      }}
    >
      {section.items.map((item, i) => {
        const isExpanded = expandedSlot?.afterItemId === item.id
        return (
          <React.Fragment key={item.id}>
            {insertSlot?.sectionIndex === sectionIndex && insertSlot.index === i && (
              <li data-insert-slot style={{ listStyle: 'none' }}>{insertSlot.content}</li>
            )}
            {isExpanded ? (
              <li
                style={{ listStyle: 'none', position: 'relative', zIndex: 11 }}
                onClick={(e) => e.stopPropagation()}
              >
                {expandedSlot!.content}
              </li>
            ) : (
              <SortableItem
                item={item}
                renderItem={renderItem}
                itemStyle={itemStyle}
                onItemClick={onItemClick}
              />
            )}
          </React.Fragment>
        )
      })}
      {insertSlot?.sectionIndex === sectionIndex && insertSlot.index === section.items.length && (
        <li data-insert-slot style={{ listStyle: 'none' }}>{insertSlot.content}</li>
      )}
    </ul>
  )
}

export function DraggableList<T extends { id: number }>({
  sections,
  onReorder,
  renderItem,
  itemStyle,
  onItemClick,
  insertSlot,
  expandedSlot,
  listRef,
  onDragStart,
  onDragEnd,
}: DraggableListProps<T>) {
  const [activeId, setActiveId] = useState<number | null>(null)
  // Live preview of `sections` while a cross-section drag is hovering: the
  // dragged item is optimistically relocated into the hovered section so
  // dnd-kit recognizes it as part of that section's sortable list and plays
  // its shift animation for the other items there. Only ever used for
  // rendering during a drag — the actual commit in handleDragEnd always
  // resolves against the real `sections` prop.
  const [dragSections, setDragSections] = useState<Section<T>[] | null>(null)
  const renderSections = dragSections ?? sections

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DRAG_ACTIVATION_PX } }),
    useSensor(TouchSensor, { activationConstraint: { delay: TOUCH_DRAG_DELAY_MS, tolerance: TOUCH_DRAG_TOLERANCE_PX } }),
  )

  const allItems = sections.flatMap((s) => s.items)
  const activeItem = activeId !== null ? allItems.find((t) => t.id === activeId) ?? null : null

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(toItemId(active.id))
    onDragStart?.()
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    const activeItemId = toItemId(active.id)
    const workingSections = dragSections ?? sections
    const target = resolveDrop(workingSections, activeItemId, over.id)
    if (!target) return
    // dnd-kit fires onDragOver on nearly every pointer-move tick, but the
    // resolved target is usually unchanged from the last tick (the pointer
    // hasn't crossed to a new section/index yet). Bailing out here avoids
    // rebuilding `dragSections` - and therefore the per-section id arrays
    // handed to <SortableContext> - on every one of those redundant ticks.
    // @dnd-kit/sortable treats a changed `items` array reference as a
    // signal that a genuine external reorder just landed, and briefly
    // disables its shift transition to avoid double-animating that
    // transition; constantly feeding it fresh-but-unchanged arrays was
    // tripping that same suppression on nearly every render, which is why
    // the live hover animation was snapping/bouncing instead of easing.
    const current = locateItem(workingSections, activeItemId)
    if (target.toSectionIndex === current.sectionIndex && target.insertIndex === current.itemIndex) return
    setDragSections(moveItemToSection(workingSections, activeItemId, target.toSectionIndex, target.insertIndex))
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (over) {
      // Resolve the final placement from `dragSections` (the live hover
      // preview) rather than recomputing from `over.id` against the pristine
      // `sections`: by the time the drag settles, the preview has usually
      // already relocated the active item to sit exactly under the pointer,
      // so `over.id` is frequently the active item's own id — that's a
      // meaningful "no-op" mid-hover (see resolveDrop), but treating it the
      // same way here would silently discard the vast majority of real drops.
      const activeItemId = toItemId(active.id)
      const workingSections = dragSections ?? sections
      const { sectionIndex: toSectionIndex, itemIndex: insertIndex } = locateItem(workingSections, activeItemId)
      const { sectionIndex: fromSectionIndex, itemIndex: fromIndex } = locateItem(sections, activeItemId)
      if (toSectionIndex !== fromSectionIndex || insertIndex !== fromIndex) {
        onReorder(activeItemId, toSectionIndex, insertIndex)
      }
    }
    setDragSections(null)
    setActiveId(null)
    onDragEnd?.()
  }

  function handleDragCancel() {
    setDragSections(null)
    setActiveId(null)
    onDragEnd?.()
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div ref={listRef}>
        {renderSections.map((section, sectionIndex) => (
          <React.Fragment key={sectionIndex}>
            {section.header}
            <SortableContext items={section.items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <SectionList
                section={section}
                sectionIndex={sectionIndex}
                isLastSection={sectionIndex === renderSections.length - 1}
                renderItem={renderItem}
                itemStyle={itemStyle}
                onItemClick={onItemClick}
                insertSlot={insertSlot}
                expandedSlot={expandedSlot}
              />
            </SortableContext>
          </React.Fragment>
        ))}
      </div>

      <DragOverlay>
        {activeItem && (
          <div
            style={{
              padding: '12px 16px',
              boxSizing: 'border-box',
              borderBottom: `1px solid ${theme.colors.divider}`,
              backgroundColor: 'white',
              opacity: 0.85,
              transform: 'scale(1.05)',
              transformOrigin: 'center center',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            }}
          >
            {renderItem(activeItem)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
