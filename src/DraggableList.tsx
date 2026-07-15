import React, { useLayoutEffect, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { theme } from './theme'
import {
  collisionDetection,
  isBelowMidpoint,
  moveItemToSection,
  resolveCommit,
  resolveDrop,
  toSectionDropId,
} from './drag-utils'
import { findInsertIndex } from './pointer-utils'

const MOUSE_DRAG_ACTIVATION_PX = 8
const TOUCH_DRAG_DELAY_MS = 400
const TOUCH_DRAG_TOLERANCE_PX = 8
const SECTION_SHIFT_TRANSITION = 'transform 200ms ease'
// The very last section's container has no dead space below its own items to
// register a drop target on (padding/margin are both 0), so there's nowhere
// to drop "at the end of the list" without landing exactly on the last item.
// This reserves some of that space as part of the last section's own
// droppable rect instead.
const LAST_SECTION_DROP_TAIL_HEIGHT = 96

function toItemId(id: UniqueIdentifier): number {
  return typeof id === 'number' ? id : Number(id)
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
    // Suppresses only the POST-drop settle animation (which otherwise snaps
    // items back then re-transitions, doubling the movement) - dnd-kit's own
    // transition still plays during an active drag regardless of this, so it
    // doesn't affect the live "space opening" shift (see handleDragOver).
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

// FLIPs a section's header to its new position when a PRECEDING section's
// height change shifts it (dnd-kit only animates the sortable items it
// manages, not arbitrary sibling content like `section.header`). Wraps ONLY
// the header, not the section's items/SortableContext: dnd-kit measures
// those via getBoundingClientRect() (which reflects live transforms) for
// both its own shift animation and collision detection, so an animated
// transform on an ancestor of theirs would corrupt both - the items already
// reach their correct rest position immediately on their own.
function AnimatedHeader({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const previousTop = useRef<number | null>(null)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const newTop = node.getBoundingClientRect().top
    const delta = previousTop.current !== null ? previousTop.current - newTop : 0
    previousTop.current = newTop
    if (delta === 0) return

    node.style.transition = 'none'
    node.style.transform = `translateY(${delta}px)`
    // Force a layout flush so the browser registers the starting transform
    // above before the next frame animates away from it.
    node.getBoundingClientRect()
    requestAnimationFrame(() => {
      node.style.transition = SECTION_SHIFT_TRANSITION
      node.style.transform = ''
    })
  })

  return <div ref={ref}>{children}</div>
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
  // Live preview of `sections`, set only when the dragged item crosses INTO
  // a section it isn't already a member of, so dnd-kit recognizes it as part
  // of that section's sortable list and plays its shift animation there.
  // Reordering WITHIN the item's current section is left untouched -
  // @dnd-kit/sortable already animates that on its own from a stable `items`
  // array; feeding it a fresh array on every such change instead (an earlier
  // attempt) tripped its "a real reorder just landed" transition-suppression
  // heuristic on nearly every render, causing the live animation to
  // snap/bounce instead of easing.
  const [dragSections, setDragSections] = useState<Section<T>[] | null>(null)
  const renderSections = dragSections ?? sections
  // The most recently resolved drop target. Tracked separately from
  // `dragSections` (which, per above, intentionally stays stale/unset during
  // same-section reordering) so the final commit in handleDragEnd doesn't
  // depend on `over.id` at the exact moment of drop - which is frequently the
  // active item's own id once it's already sitting where the pointer is.
  const dragTargetRef = useRef<{ toSectionIndex: number; insertIndex: number } | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DRAG_ACTIVATION_PX } }),
    useSensor(TouchSensor, { activationConstraint: { delay: TOUCH_DRAG_DELAY_MS, tolerance: TOUCH_DRAG_TOLERANCE_PX } }),
  )

  const allItems = sections.flatMap((s) => s.items)
  const activeItem = activeId !== null ? allItems.find((t) => t.id === activeId) ?? null : null

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(toItemId(active.id))
    dragTargetRef.current = null
    onDragStart?.()
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    const activeItemId = toItemId(active.id)
    const workingSections = dragSections ?? sections
    // insertAfter: is the dragged item's current (live) center below the
    // hovered item's own center? A cross-section drop has no prior position
    // within the target section to infer a direction from (unlike
    // same-section dragging), so without this it always inserted before
    // whatever item the pointer first landed on when crossing into a
    // section - see resolveReorder for the snap/re-resolve glitch that caused.
    const insertAfter = isBelowMidpoint(active.rect.current.translated, over.rect)
    const target = resolveDrop(workingSections, activeItemId, over.id, insertAfter)
    if (!target) return
    dragTargetRef.current = target

    if (target.toSectionIndex === target.fromSectionIndex) return
    setDragSections(moveItemToSection(workingSections, activeItemId, target.toSectionIndex, target.insertIndex))
  }

  function handleDragEnd({ active }: DragEndEvent) {
    const activeItemId = toItemId(active.id)
    const commit = resolveCommit(sections, activeItemId, dragTargetRef.current)
    if (commit) {
      onReorder(activeItemId, commit.toSectionIndex, commit.insertIndex)
    }
    dragTargetRef.current = null
    setDragSections(null)
    setActiveId(null)
    onDragEnd?.()
  }

  function handleDragCancel() {
    dragTargetRef.current = null
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
            {section.header && <AnimatedHeader>{section.header}</AnimatedHeader>}
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
