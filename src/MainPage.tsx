import { useEffect, useRef, useState } from 'react'
import { createTask, deleteTask, loadAllBlocks, loadAllSubtaskLinks, updateTaskDone, updateTaskName, updateTaskNotes, updateTaskRank, updateTaskStatus, type BlockingRelationship, type SubtaskLink, type Task, type Status, type View } from './db'
import { DraggableList } from './DraggableList'
import { AddTaskFab, NewTaskInputField, computeInsertRank, type NewTaskInput, type InsertSlotTarget } from './AddTaskInput'
import { rankBetween } from './rank-utils'
import { QuickSelectPanel } from './QuickSelectPanel'
import { ViewModal } from './ViewModal'

const OVERSCROLL_TRIGGER_DISTANCE = 100

function isIosPwa(): boolean {
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

function shouldShowViewSelectorButton(): boolean {
  const visibility = localStorage.getItem('view-selector-button-visibility')
  if (visibility === 'always-show') return true
  if (visibility === 'always-hide') return false
  return !isIosPwa()
}

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

function TaskRow({ task, onDoneChange, showIndicator, isBlocked, parentTaskName }: { task: Task; onDoneChange: (done: boolean) => void; showIndicator?: boolean; isBlocked: boolean; parentTaskName?: string }) {
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
      {parentTaskName && (
        <span style={{ marginLeft: 6, fontSize: 12, color: '#888' }}>↳ {parentTaskName}</span>
      )}
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
  const [modalTaskId, setModalTaskId] = useState<number | null>(null)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [blockingRelationships, setBlockingRelationships] = useState<BlockingRelationship[]>([])
  const [subtaskLinks, setSubtaskLinks] = useState<SubtaskLink[]>([])
  const [pullDistance, setPullDistance] = useState(0)
  const [isTouching, setIsTouching] = useState(false)

  useEffect(() => {
    loadAllBlocks().then(setBlockingRelationships)
    loadAllSubtaskLinks().then(setSubtaskLinks)
  }, [])

  const listRef = useRef<HTMLDivElement>(null)
  const inputKeyRef = useRef(0)

  const pullDistanceRef = useRef(0)
  const noModalOpen = selectedTaskId === null && !viewModalOpen && modalTaskId === null

  useEffect(() => {
    function handleScroll() {
      // Negative scrollY only occurs during a rubber-band overscroll, which is only
      // reachable in an installed iOS PWA - other platforms don't overscroll at all,
      // so they rely on the view-selector button instead of this gesture.
      const distance = Math.max(0, -window.scrollY)
      // Read synchronously in handleTouchEnd below without needing pullDistance in this
      // effect's dependency array (which would tear down/reattach these listeners on
      // every scroll tick); the state copy exists only to re-render the pie's fill.
      pullDistanceRef.current = distance
      setPullDistance(distance)
    }
    function handleTouchStart() {
      setIsTouching(true)
    }
    function handleTouchEnd() {
      setIsTouching(false)
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
  }, [noModalOpen])

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

  async function applyStatusChange(id: number, statusSlug: string) {
    await updateTaskStatus(id, statusSlug)
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, statusSlug } : t)))
  }

  async function handleChangeStatus(id: number, statusSlug: string) {
    await applyStatusChange(id, statusSlug)
    setSelectedTaskId(null)
  }

  async function handleModalChangeStatus(id: number, statusSlug: string) {
    await applyStatusChange(id, statusSlug)
    setModalTaskId(null)
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

  async function applyDelete(id: number) {
    await deleteTask(id)
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  async function handleDelete(id: number) {
    await applyDelete(id)
    setSelectedTaskId(null)
  }

  async function handleModalDelete(id: number) {
    await applyDelete(id)
    setModalTaskId(null)
  }

  function handleTaskCreated(task: Task) {
    setTasks((prev) => {
      const next = [...prev, task]
      next.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
      return next
    })
  }

  const parentTaskNameByChildId = new Map(
    subtaskLinks
      .map((link) => {
        const parentTask = tasks.find((t) => t.id === link.parentTaskId)
        return parentTask ? [link.childTaskId, parentTask.name] as const : undefined
      })
      .filter((entry): entry is [number, string] => entry !== undefined)
  )

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
        onOpenTask: (id: number) => setModalTaskId(id),
        onDoneChange: handleDoneChange,
        onBlockingRelationshipAdded: () => loadAllBlocks().then(setBlockingRelationships),
        onTaskCreated: handleTaskCreated,
        onSubtaskLinkAdded: () => loadAllSubtaskLinks().then(setSubtaskLinks),
      }
    : null

  const modalTask = modalTaskId !== null ? tasks.find((t) => t.id === modalTaskId) ?? null : null

  const relatedTaskModalProps = modalTask
    ? {
        task: modalTask,
        allTasks: tasks,
        statuses,
        onClose: () => setModalTaskId(null),
        onRename: handleRename,
        onChangeStatus: handleModalChangeStatus,
        onDelete: handleModalDelete,
        onUpdateNotes: handleUpdateNotes,
        onOpenTask: (id: number) => setModalTaskId(id),
        onDoneChange: handleDoneChange,
        onBlockingRelationshipAdded: () => loadAllBlocks().then(setBlockingRelationships),
        onTaskCreated: handleTaskCreated,
        onSubtaskLinkAdded: () => loadAllSubtaskLinks().then(setSubtaskLinks),
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

  const relatedTaskModal = relatedTaskModalProps && (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <QuickSelectPanel key={relatedTaskModalProps.task.id} {...relatedTaskModalProps} />
      </div>
    </div>
  )

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
  // "Armed" means releasing right now would open the view selector - full pie alone
  // isn't enough, since a bounce-back after the finger already lifted can still read
  // as pullDistance >= threshold without a touch in progress.
  const overscrollArmed = overscrollPct >= 1 && isTouching
  const overscrollIndicator = overscrollPct > 0 && noModalOpen && (
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
        color: overscrollArmed ? '#1a73e8' : '#9e9e9e',
        background: `conic-gradient(currentColor ${overscrollPct * 100}%, transparent ${overscrollPct * 100}%)`,
      }}
    />
  )

  return (
    <main
      onClick={() => setSelectedTaskId(null)}
      style={{ minHeight: '100vh' }}
    >
      {shouldShowViewSelectorButton() && (
        <ViewSelectorButton viewName={currentView.name} onClick={() => setViewModalOpen(true)} />
      )}

      <DraggableList
        sections={sections}
        onReorder={handleReorder}
        renderItem={(task) => (
          <TaskRow
            task={task}
            onDoneChange={(done) => handleDoneChange(task.id, done)}
            showIndicator={autoTransitionedTaskIds?.has(task.id)}
            isBlocked={blockingRelationships.some((r) => r.toTaskId === task.id)}
            parentTaskName={parentTaskNameByChildId.get(task.id)}
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
      {relatedTaskModal}
    </main>
  )
}
