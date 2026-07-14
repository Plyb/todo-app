import { useEffect, useRef, useState } from 'react'
import { loadAllBlocks, loadAllSubtaskLinks } from './db'
import type { BlockingRelationship, SubtaskLink, Task } from './types'
import { DraggableList } from './DraggableList'
import { AddTaskFab, NewTaskInputField, type NewTaskInput, type InsertSlotTarget } from './AddTaskInput'
import { rankAtInsertIndex } from './rank-utils'
import { QuickSelectPanel } from './QuickSelectPanel'
import { ViewModal } from './ViewModal'
import { theme } from './theme'
import { useOverscrollGesture } from './useOverscrollGesture'
import { useTasks, useStatuses, useViews } from './tasks-context'

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
  onNavigateToSettings: () => void
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
        gap: theme.space.sm,
        width: '100%',
        padding: '14px 16px',
        border: 'none',
        borderBottom: '1px solid #e0e0e0',
        background: 'white',
        fontSize: theme.fontSizes.xl,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {viewName}
      <span style={{ color: theme.colors.brand }}>▾</span>
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
      <span style={task.done ? { color: theme.colors.textDisabled } : undefined}>
        {isBlocked && <span style={{ marginRight: 4, color: theme.colors.danger }}>⊘</span>}
        {task.name}
      </span>
      {parentTaskName && (
        <span style={{ marginLeft: 6, fontSize: theme.fontSizes.xs, color: theme.colors.textSecondary }}>↳ {parentTaskName}</span>
      )}
      {showIndicator && (
        <span style={{ marginLeft: 6, width: 8, height: 8, borderRadius: '50%', background: '#fbc02d', display: 'inline-block', verticalAlign: 'middle' }} />
      )}
    </>
  )
}

export default function MainPage({ onNavigateToSettings }: MainPageProps) {
  const {
    tasks,
    autoTransitionedTaskIds,
    setDone,
    moveTask,
    setStatus,
    deleteTask,
    createTask,
    clearAutoTransitionIndicator,
  } = useTasks()
  const { statuses } = useStatuses()
  const { views, currentViewSlug, recentViewSlugs, openView } = useViews()
  const [newTaskInput, setNewTaskInput] = useState<NewTaskInput | null>(null)
  const [fabDragSlot, setFabDragSlot] = useState<InsertSlotTarget | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [modalTaskId, setModalTaskId] = useState<number | null>(null)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [blockingRelationships, setBlockingRelationships] = useState<BlockingRelationship[]>([])
  const [subtaskLinks, setSubtaskLinks] = useState<SubtaskLink[]>([])

  useEffect(() => {
    loadAllBlocks().then(setBlockingRelationships)
    loadAllSubtaskLinks().then(setSubtaskLinks)
  }, [])

  const listRef = useRef<HTMLDivElement>(null)
  const inputKeyRef = useRef(0)

  const noModalOpen = selectedTaskId === null && !viewModalOpen && modalTaskId === null
  const { pullDistance, isTouching } = useOverscrollGesture({
    enabled: noModalOpen,
    threshold: OVERSCROLL_TRIGGER_DISTANCE,
    onTrigger: () => setViewModalOpen(true),
  })

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
        if (autoTransitionedTaskIdsRef.current.has(task.id)) {
          clearAutoTransitionIndicator(task.id)
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

  function handleReorder(draggedId: number, toSectionIndex: number, insertIndex: number) {
    if (!currentView) return
    const toStatusSlug = currentView.statusSlugs[toSectionIndex]
    const toSectionTasks = tasks.filter((t) => t.statusSlug === toStatusSlug)
    const newRank = rankAtInsertIndex(toSectionTasks, insertIndex, draggedId)
    const needsStatusChange = !toSectionTasks.some((t) => t.id === draggedId)
    moveTask(draggedId, toStatusSlug, newRank, needsStatusChange)
  }

  async function handleChangeStatus(id: number, statusSlug: string) {
    await setStatus(id, statusSlug)
    setSelectedTaskId(null)
  }

  async function handleModalChangeStatus(id: number, statusSlug: string) {
    await setStatus(id, statusSlug)
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
    const rank = rankAtInsertIndex(sectionTasks, insertIndex)
    await createTask(trimmed, rank, statusSlug)
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
    clearAutoTransitionIndicator(taskId)
  }

  async function handleDelete(id: number) {
    await deleteTask(id)
    setSelectedTaskId(null)
  }

  async function handleModalDelete(id: number) {
    await deleteTask(id)
    setModalTaskId(null)
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
        onChangeStatus: handleChangeStatus,
        onDelete: handleDelete,
        onOpenTask: (id: number) => setModalTaskId(id),
        onBlockingRelationshipAdded: () => loadAllBlocks().then(setBlockingRelationships),
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
        onChangeStatus: handleModalChangeStatus,
        onDelete: handleModalDelete,
        onOpenTask: (id: number) => setModalTaskId(id),
        onBlockingRelationshipAdded: () => loadAllBlocks().then(setBlockingRelationships),
        onSubtaskLinkAdded: () => loadAllSubtaskLinks().then(setSubtaskLinks),
      }
    : null

  const itemStyleFn = (task: Task) => {
    const isSelected = task.id === selectedTaskId
    const isFaded = selectedTaskId !== null && !isSelected
    return {
      opacity: isFaded ? 0.4 : 1,
      backgroundColor: isSelected ? theme.colors.selected : 'transparent',
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
            borderRadius: theme.radii.md,
            border: `2px dashed ${theme.colors.brand}`,
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
        <h2 style={{ padding: '16px 16px 8px', margin: 0, fontSize: theme.fontSizes.xxl, fontWeight: 700 }}>
          {status?.name ?? slug}
        </h2>
      ),
      items: tasks.filter((t) => t.statusSlug === slug),
    }
  })

  const expandedSlot = quickSelectPanelProps
    ? {
        afterItemId: quickSelectPanelProps.task.id,
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
        padding: theme.space.md,
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
      onSelect={openView}
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
        color: overscrollArmed ? theme.colors.brand : '#9e9e9e',
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
            onDoneChange={(done) => setDone(task.id, done)}
            showIndicator={autoTransitionedTaskIds.has(task.id)}
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
