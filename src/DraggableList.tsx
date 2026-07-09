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
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type DraggableListProps<T extends { id: number }> = {
  items: T[]
  onReorder: (draggedId: number, insertIndex: number) => void
  renderItem: (item: T) => React.ReactNode
  itemStyle?: (item: T) => React.CSSProperties
  onItemClick?: (id: number) => void
  insertSlot?: { index: number; content: React.ReactNode }
  expandedSlot?: { afterItemId: number; content: React.ReactNode }
  listRef?: React.RefObject<HTMLUListElement | null>
  onDragStart?: () => void
  onDragEnd?: () => void
  /**
   * When true, skip creating an internal DndContext/DragOverlay.
   * The component expects a parent DndContext to already exist.
   * Used by MainPage to enable cross-section dragging via a shared context.
   */
  skipContext?: boolean
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
  } = useSortable({ id: item.id })

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
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        cursor: isDragging ? 'grabbing' : 'grab',
        padding: '12px 16px',
        borderBottom: '1px solid #eee',
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

function SortableListContent<T extends { id: number }>({
  items,
  renderItem,
  itemStyle,
  onItemClick,
  insertSlot,
  expandedSlot,
  listRef,
}: Omit<DraggableListProps<T>, 'onReorder' | 'onDragStart' | 'onDragEnd' | 'skipContext'>) {
  return (
    <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
      <ul ref={listRef} style={{ listStyle: 'none', padding: 0, margin: 0, position: 'relative' }}>
        {items.map((item, i) => {
          const isExpanded = expandedSlot?.afterItemId === item.id
          return (
            <React.Fragment key={item.id}>
              {insertSlot?.index === i && (
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
        {insertSlot?.index === items.length && (
          <li data-insert-slot style={{ listStyle: 'none' }}>{insertSlot.content}</li>
        )}
      </ul>
    </SortableContext>
  )
}

export function DraggableList<T extends { id: number }>({
  items,
  onReorder,
  renderItem,
  itemStyle,
  onItemClick,
  insertSlot,
  expandedSlot,
  listRef,
  onDragStart,
  onDragEnd,
  skipContext,
}: DraggableListProps<T>) {
  const [activeId, setActiveId] = useState<number | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 8 } }),
  )

  const activeItem = activeId !== null ? items.find((t) => t.id === activeId) ?? null : null

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as number)
    onDragStart?.()
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((t) => t.id === active.id)
      const overIndex = items.findIndex((t) => t.id === over.id)
      const others = items.filter((t) => t.id !== active.id)
      const othersOverIndex = others.findIndex((t) => t.id === over.id)
      // dragging down → insert after over; dragging up → insert before over
      const insertIndex = oldIndex < overIndex ? othersOverIndex + 1 : othersOverIndex
      onReorder(active.id as number, insertIndex)
    }
    setActiveId(null)
    onDragEnd?.()
  }

  function handleDragCancel() {
    setActiveId(null)
    onDragEnd?.()
  }

  const contentProps = { items, renderItem, itemStyle, onItemClick, insertSlot, expandedSlot, listRef }

  if (skipContext) {
    return <SortableListContent {...contentProps} />
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableListContent {...contentProps} />

      <DragOverlay>
        {activeItem && (
          <div
            style={{
              padding: '12px 16px',
              boxSizing: 'border-box',
              borderBottom: '1px solid #eee',
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
