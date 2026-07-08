import { useRef, useState } from 'react'

type DragState = {
  taskId: number
  startY: number
  currentY: number
  insertIndex: number
  rowHeight: number
}

function isPrimaryButton(e: React.PointerEvent): boolean {
  return e.pointerType !== 'mouse' || e.button === 0
}

type DraggableListProps<T extends { id: number }> = {
  items: T[]
  onReorder: (draggedId: number, insertIndex: number) => void
  renderItem: (item: T) => React.ReactNode
  itemStyle?: (item: T) => React.CSSProperties
  onItemClick?: (id: number) => void
}

export function DraggableList<T extends { id: number }>({
  items,
  onReorder,
  renderItem,
  itemStyle,
  onItemClick,
}: DraggableListProps<T>) {
  const [dragState, setDragState] = useState<DragState | null>(null)

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rowsByTaskId = useRef<Map<number, HTMLLIElement>>(new Map())
  const didDragRef = useRef(false)

  function getRowHeight(): number {
    return rowsByTaskId.current.get(items[0]?.id)?.getBoundingClientRect().height ?? 48
  }

  function computeInsertIndex(probeY: number, draggedTaskId: number): number {
    const others = items.filter((t) => t.id !== draggedTaskId)
    const othersWithRects = others.flatMap((t, i) => {
      const el = rowsByTaskId.current.get(t.id)
      return el ? [{ index: i, rect: el.getBoundingClientRect() }] : []
    })
    for (const { index, rect } of othersWithRects) {
      if (probeY < rect.top + rect.height / 2) return index
    }
    return others.length
  }

  function handlePointerDown(e: React.PointerEvent<HTMLLIElement>, taskId: number) {
    if (!isPrimaryButton(e)) return

    didDragRef.current = false
    const startY = e.clientY
    // React nullifies currentTarget after the event handler returns, so capture it now
    const target = e.currentTarget

    longPressTimerRef.current = setTimeout(() => {
      didDragRef.current = true
      const rowHeight = getRowHeight()
      target.setPointerCapture(e.pointerId)
      setDragState({
        taskId,
        startY,
        currentY: startY,
        insertIndex: items.findIndex((t) => t.id === taskId),
        rowHeight,
      })
    }, 400)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLLIElement>) {
    if (!dragState) return
    const el = rowsByTaskId.current.get(dragState.taskId)
    const rect = el?.getBoundingClientRect()
    const ghostMidY = rect
      ? rect.top + (e.clientY - dragState.startY) + dragState.rowHeight / 2
      : e.clientY
    const insertIndex = computeInsertIndex(ghostMidY, dragState.taskId)
    setDragState((prev) => prev ? { ...prev, currentY: e.clientY, insertIndex } : null)
  }

  function handlePointerUp(e: React.PointerEvent<HTMLLIElement>, taskId: number) {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }

    if (!dragState) {
      if (!didDragRef.current && onItemClick) {
        const target = e.target as HTMLElement
        if (!target.closest('input[type="checkbox"]')) {
          onItemClick(taskId)
        }
      }
      return
    }

    onReorder(dragState.taskId, dragState.insertIndex)
    setDragState(null)
  }

  function handlePointerCancel() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    // fires when the browser interrupts the pointer (e.g. system gesture, scroll takeover)
    setDragState(null)
  }

  const draggedItem = dragState ? items.find((t) => t.id === dragState.taskId) : null
  const ghostOffsetY = dragState ? dragState.currentY - dragState.startY : 0

  const others = dragState ? items.filter((t) => t.id !== dragState.taskId) : []
  const originalDraggedIndex = dragState ? items.findIndex((t) => t.id === dragState.taskId) : -1

  function getTaskTranslateY(item: T): number {
    if (!dragState || item.id === dragState.taskId) return 0

    const j = others.findIndex((t) => t.id === item.id)
    const { insertIndex, rowHeight } = dragState

    const shiftUp = j >= originalDraggedIndex ? -rowHeight : 0
    const shiftDown = j >= insertIndex ? rowHeight : 0
    return shiftUp + shiftDown
  }

  return (
    <>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, position: 'relative' }}>
        {items.map((item) => {
          const isDragged = dragState?.taskId === item.id
          const translateY = getTaskTranslateY(item)

          return (
            <li
              key={item.id}
              ref={(el) => {
                if (el) rowsByTaskId.current.set(item.id, el)
                else rowsByTaskId.current.delete(item.id)
              }}
              onPointerDown={(e) => handlePointerDown(e, item.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={(e) => handlePointerUp(e, item.id)}
              onPointerCancel={handlePointerCancel}
              style={{
                userSelect: 'none',
                touchAction: 'none',
                cursor: dragState ? 'grabbing' : 'grab',
                padding: '12px 16px',
                borderBottom: '1px solid #eee',
                boxSizing: 'border-box',
                opacity: isDragged ? 0 : 1,
                transform: isDragged ? 'none' : `translateY(${translateY}px)`,
                transition: isDragged ? 'none' : 'transform 0.15s ease, all 0.2s ease',
                position: 'relative',
                zIndex: isDragged ? 0 : 1,
                ...itemStyle?.(item),
              }}
            >
              {renderItem(item)}
            </li>
          )
        })}
      </ul>

      {draggedItem && dragState && (() => {
        const el = rowsByTaskId.current.get(draggedItem.id)
        const rect = el?.getBoundingClientRect()
        const top = rect ? rect.top + ghostOffsetY : dragState.currentY
        const left = rect?.left ?? 0
        const width = rect?.width ?? 300

        return (
          <div
            style={{
              position: 'fixed',
              top,
              left,
              width,
              padding: '12px 16px',
              boxSizing: 'border-box',
              borderBottom: '1px solid #eee',
              backgroundColor: 'white',
              opacity: 0.85,
              transform: 'scale(1.05)',
              transformOrigin: 'center center',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              pointerEvents: 'none',
              zIndex: 1000,
            }}
          >
            {renderItem(draggedItem)}
          </div>
        )
      })()}
    </>
  )
}
