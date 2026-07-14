import React, { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { theme } from './theme'
import { resolveReorder } from './drag-utils'
import { findInsertIndex } from './pointer-utils'

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
    // dnd-kit's default layout-change animation causes items to snap back to
    // their pre-drop position and then transition again once the reordered
    // data arrives, doubling the movement. The drag-preview transform (shown
    // while dragging) is unaffected by this and keeps animating normally.
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

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 8 } }),
  )

  const allItems = sections.flatMap((s) => s.items)
  const activeItem = activeId !== null ? allItems.find((t) => t.id === activeId) ?? null : null

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(toItemId(active.id))
    onDragStart?.()
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (over && active.id !== over.id) {
      const { toSectionIndex, insertIndex } = resolveReorder(sections, toItemId(active.id), toItemId(over.id))
      onReorder(toItemId(active.id), toSectionIndex, insertIndex)
    }
    setActiveId(null)
    onDragEnd?.()
  }

  function handleDragCancel() {
    setActiveId(null)
    onDragEnd?.()
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div ref={listRef}>
        {sections.map((section, sectionIndex) => (
          <React.Fragment key={sectionIndex}>
            {section.header}
            <SortableContext items={section.items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <ul
                data-section-index={sectionIndex}
                style={{ listStyle: 'none', padding: 0, margin: 0, position: 'relative' }}
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
