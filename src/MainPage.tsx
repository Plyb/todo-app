import { useEffect, useRef, useState } from 'react'
import { createTask, deleteTask, loadAllBlocks, updateTaskDone, updateTaskName, updateTaskNotes, updateTaskRank, updateTaskStatus, type BlockingRelationship, type Task, type Status, type View } from './db'
import { DraggableList } from './DraggableList'
import { AddTaskFab, NewTaskInputField, computeInsertRank, type NewTaskInput, type InsertSlotTarget } from './AddTaskInput'
import { rankBetween } from './rank-utils'
import { QuickSelectPanel } from './QuickSelectPanel'
import { ViewModal } from './ViewModal'

const OVERSCROLL_TRIGGER_DISTANCE = 100

type MainPageProps = {
  tasks: Task[]
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>
  statuses: Status[]
  views: View[]
  currentViewSlug: string
  recentViewSlugs: string[]
  onOpenView: (slug: string) => void
  onNavigateToSettings: () => void
  autoTransitionedTaskIds?: Set<number>
  onClearAutoTransitionIndicator?: (id: number) => void
}

function computeNewRank(sectionTasks: Task[], insertIndex: number, draggedTaskId: number): string {
  const others = sectionTasks.filter((t) => t.id !== draggedTaskId)
  const prev = insertIndex > 0 ? others[insertIndex - 1] : null
  const next = insertIndex < others.length ? others[insertIndex] : null
  return rankBetween(prev, next)
}

function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ position: 'fixed', bottom: 16, left: 16 }}>
      ⚙
    </button>
  )
}

function ViewSelectorButton({ viewName, onClick }: { viewName: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        padding: '14px 16px',
        border: 'none',
        borderBottom: '1px solid #e0e0e0',
        background: 'white',
        fontSize: 16,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {viewName}
      <span style={{ color: '#1a73e8' }}>▾</span>
    </button>
  )
}

function TaskRow({ task, onDoneChange, showIndicator, isBlocked }: { task: Task; onDoneChange: (done: boolean) => void; showIndicator?: boolean; isBlocked: boolean }) {
  return (
    <>
      <input
        type="checkbox"
        checked={task.done}
        onChange={(e) => onDoneChange(e.target.checked)}
      />
      <span style={task.done ? { color: '#aaa' } : undefined}>
        {isBlocked && <span style={{ marginRight: 4, color: '#d32f2f' }}>⊘</span>}
        {task.name}
      </span>
      {showIndicator && (
        <span style={{ marginLeft: 6, width: 8, height: 8, borderRadius: '50%', background: '#fbc02d', display: 'inline-block', verticalAlign: 'middle' }} />
      )}
    </>
  )
}

export default function MainPage({
  tasks,
  setTasks,
  statuses,
  views,
  currentViewSlug,
  recentViewSlugs,
  onOpenView,
  onNavigateToSettings,
  autoTransitionedTaskIds,
  onClearAutoTransitionIndicator,
}: MainPageProps) {
  const [newTaskInput, setNewTaskInput] = useState<NewTaskInput | null>(null)
  const [fabDragSlot, setFabDragSlot] = useState<InsertSlotTarget | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [blockingRelationships, setBlockingRelationships] = useState<BlockingRelationship[]>([])
  const [pullDistance, setPullDistance] = useState(0)

  useEffect(() => {
    loadAllBlocks().then(setBlockingRelationships)
  }, [])

  const listRef = useRef<HTMLDivElement>(null)
  const inputKeyRef = useRef(0)

  // Lets the document rubber-band on overscroll instead of the browser chaining
  // it into a native pull-to-refresh reload; scoped to MainPage's lifetime since
  // this behavior shouldn't apply on the settings page.
  useEffect(() => {
    const root = document.documentElement
    const previousOverscrollBehaviorY = root.style.overscrollBehaviorY
    root.style.overscrollBehaviorY = 'contain'
    return () => {
      root.style.overscrollBehaviorY = previousOverscrollBehaviorY
    }
  }, [])

  const isTouchingRef = useRef(false)
  const pullDistanceRef = useRef(0)

  useEffect(() => {
    function handleScroll() {
      const distance = Math.max(0, -window.scrollY)
      pullDistanceRef.current = distance
      setPullDistance(distance)
    }
    function handleTouchStart() {
      isTouchingRef.current = true
    }
    function handleTouchEnd() {
      isTouchingRef.current = false
      const noModalOpen = selectedTaskId === null && !viewModalOpen
      // Deferred to release (rather than triggering the instant pullDistance crosses the
      // threshold) so a finger lifted early doesn't open the modal, and so residual scroll
      // events after release (rubber-band settling, mouse wheel) can't spuriously trigger it.
      if (pullDistanceRef.current >= OVERSCROLL_TRIGGER_DISTANCE && noModalOpen) {
        setViewModalOpen(true)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [selectedTaskId, viewModalOpen])

  const currentView = views.find((v) => v.slug === currentViewSlug)

  // Tasks shown across all sections of the current view, used below so the
  // cleanup effect can clear indicators for whatever was actually on screen
  // right before the view changes.
  const displayedTasks = currentView ? tasks.filter((t) => currentView.statusSlugs.includes(t.statusSlug)) : []

  const displayedTasksRef = useRef(displayedTasks)
  displayedTasksRef.current = displayedTasks
  const autoTransitionedTaskIdsRef = useRef(autoTransitionedTaskIds)
  autoTransitionedTaskIdsRef.current = autoTransitionedTaskIds

  useEffect(() => {
    // Cleanup reads the refs (not a closed-over displayedTasks/autoTransitionedTaskIds)
    // so it clears indicators for whatever was actually shown right before navigating
    // away, not whatever was shown when this effect last ran.
    return () => {
      displayedTasksRef.current.forEach((task) => {
        if (autoTransitionedTaskIdsRef.current?.has(task.id)) {
          onClearAutoTransitionIndicator?.(task.id)
        }
      })
    }
  }, [currentViewSlug])

  if (!currentView) {
    return (
      <main style={{ minHeight: '100vh' }}>
        <SettingsButton onClick={onNavigateToSettings} />
      </main>
    )
  }

  function openInput(sectionIndex: number, insertIndex: number) {
    inputKeyRef.current++
    setNewTaskInput({ sectionIndex, insertIndex })
  }

  function handleDoneChange(id: number, done: boolean) {
    updateTaskDone(id, done)
    setTasks(tasks.map((t) => (t.id === id ? { ...t, done } : t)))
  }

  function handleUpdateNotes(id: number, notes: string) {
    updateTaskNotes(id, notes)
    setTasks(tasks.map((t) => (t.id === id ? { ...t, notes } : t)))
  }

  function handleReorder(draggedId: number, toSectionIndex: number, insertIndex: number) {
    if (!currentView) return
    const toStatusSlug = currentView.statusSlugs[toSectionIndex]
    const draggedTask = tasks.find((t) => t.id === draggedId)!
    const toSectionTasks = tasks.filter((t) => t.statusSlug === toStatusSlug)
    const newRank = computeNewRank(toSectionTasks, insertIndex, draggedId)
    const needsStatusChange = draggedTask.statusSlug !== toStatusSlug
    if (needsStatusChange) {
      updateTaskStatus(draggedId, toStatusSlug)
    }
    updateTaskRank(draggedId, newRank)
    setTasks((prev) => {
      const updated = prev.map((t) =>
        t.id === draggedId ? { ...t, rank: newRank, statusSlug: toStatusSlug } : t
      )
      return updated.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
    })
  }

  function handleRename(id: number, name: string) {
    updateTaskName(id, name)
    setTasks(tasks.map((t) => (t.id === id ? { ...t, name } : t)))
  }

  async function handleChangeStatus(id: number, statusSlug: string) {
    await updateTaskStatus(id, statusSlug)
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, statusSlug } : t)))
    setSelectedTaskId(null)
  }

  async function commitInput(value: string, sectionIndex: number, insertIndex: number, andOpenAnother: boolean) {
    const trimmed = value.trim()
    if (!trimmed) {
      setNewTaskInput(null)
      return
    }
    if (!currentView) return
    const statusSlug = currentView.statusSlugs[sectionIndex]
    const sectionTasks = tasks.filter((t) => t.statusSlug === statusSlug)
    const rank = computeInsertRank(sectionTasks, insertIndex)
    const task = await createTask(trimmed, rank, statusSlug)
    setTasks((prev) => {
      const next = [...prev, task]
      next.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
      return next
    })
    if (andOpenAnother) {
      openInput(sectionIndex, insertIndex + 1)
    } else {
      setNewTaskInput(null)
    }
  }

  function handleInputBlur(e: React.FocusEvent<HTMLInputElement>, sectionIndex: number, insertIndex: number) {
    commitInput(e.currentTarget.value, sectionIndex, insertIndex, false)
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>, sectionIndex: number, insertIndex: number) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitInput(e.currentTarget.value, sectionIndex, insertIndex, true)
    } else if (e.key === 'Escape') {
      setNewTaskInput(null)
    }
  }

  function handleTaskClick(taskId: number) {
    setSelectedTaskId((prev) => (prev === taskId ? null : taskId))
    onClearAutoTransitionIndicator?.(taskId)
  }

  async function handleDelete(id: number) {
    await deleteTask(id)
    setTasks((prev) => prev.filter((t) => t.id !== id))
    setSelectedTaskId(null)
  }

  const selectedTask = selectedTaskId !== null ? tasks.find((t) => t.id === selectedTaskId) ?? null : null

  const quickSelectPanelProps = selectedTask
    ? {
        task: selectedTask,
        allTasks: tasks,
        statuses,
        onClose: () => setSelectedTaskId(null),
        onRename: handleRename,
        onChangeStatus: handleChangeStatus,
        onDelete: handleDelete,
        onUpdateNotes: handleUpdateNotes,
        onOpenTask: (id: number) => setSelectedTaskId(id),
        onDoneChange: handleDoneChange,
        onBlockingRelationshipAdded: () => loadAllBlocks().then(setBlockingRelationships),
      }
    : null

  const itemStyleFn = (task: Task) => {
    const isSelected = task.id === selectedTaskId
    const isFaded = selectedTaskId !== null && !isSelected
    return {
      opacity: isFaded ? 0.4 : 1,
      backgroundColor: isSelected ? '#e8f0fe' : 'transparent',
    }
  }

  const insertSlot = newTaskInput !== null
    ? {
        index: newTaskInput.insertIndex,
        sectionIndex: newTaskInput.sectionIndex,
        content: (
          <NewTaskInputField
            key={inputKeyRef.current}
            sectionIndex={newTaskInput.sectionIndex}
            insertIndex={newTaskInput.insertIndex}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
          />
        ),
      }
    : fabDragSlot !== null
    ? {
        index: fabDragSlot.index,
        sectionIndex: fabDragSlot.sectionIndex,
        content: (
          <div style={{
            height: 44,
            background: 'rgba(26,115,232,0.08)',
            borderRadius: 6,
            border: '2px dashed #1a73e8',
            margin: '4px 0',
            transition: 'all 0.15s ease',
          }} />
        ),
      }
    : undefined

  const sections = currentView.statusSlugs.map((slug) => {
    const status = statuses.find((s) => s.slug === slug)
    return {
      header: (
        <h2 style={{ padding: '16px 16px 8px', margin: 0, fontSize: 18, fontWeight: 700 }}>
          {status?.name ?? slug}
        </h2>
      ),
      items: tasks.filter((t) => t.statusSlug === slug),
    }
  })

  const expandedSlot = quickSelectPanelProps
    ? {
        afterItemId: selectedTaskId!,
        content: <QuickSelectPanel {...quickSelectPanelProps} />,
      }
    : undefined

  const viewModal = viewModalOpen && (
    <ViewModal
      views={views}
      recentViewSlugs={recentViewSlugs}
      currentViewSlug={currentViewSlug}
      onSelect={onOpenView}
      onClose={() => setViewModalOpen(false)}
    />
  )

  const overscrollPct = Math.min(1, pullDistance / OVERSCROLL_TRIGGER_DISTANCE)
  const overscrollIndicator = overscrollPct > 0 && selectedTaskId === null && !viewModalOpen && (
    <div
      style={{
        position: 'fixed',
        top: 60,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 28,
        height: 28,
        borderRadius: '50%',
        pointerEvents: 'none',
        color: overscrollPct >= 1 ? '#1a73e8' : '#9e9e9e',
        background: `conic-gradient(currentColor ${overscrollPct * 100}%, transparent ${overscrollPct * 100}%)`,
      }}
    />
  )

  return (
    <main
      onClick={() => setSelectedTaskId(null)}
      style={{ minHeight: '100vh' }}
    >
      <ViewSelectorButton viewName={currentView.name} onClick={() => setViewModalOpen(true)} />

      <DraggableList
        sections={sections}
        onReorder={handleReorder}
        renderItem={(task) => (
          <TaskRow
            task={task}
            onDoneChange={(done) => handleDoneChange(task.id, done)}
            showIndicator={autoTransitionedTaskIds?.has(task.id)}
            isBlocked={blockingRelationships.some((r) => r.toTaskId === task.id)}
          />
        )}
        listRef={listRef}
        insertSlot={insertSlot}
        onItemClick={selectedTaskId === null ? handleTaskClick : undefined}
        itemStyle={itemStyleFn}
        expandedSlot={expandedSlot}
      />

      <SettingsButton onClick={onNavigateToSettings} />

      <AddTaskFab
        listRef={listRef}
        onRequestInsert={openInput}
        onDragInsertSlot={setFabDragSlot}
      />

      {overscrollIndicator}
      {viewModal}
    </main>
  )
}
