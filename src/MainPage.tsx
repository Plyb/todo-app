import { useEffect, useMemo, useRef, useState } from 'react'
import { loadAllBlocks, loadAllSubtaskLinks } from './db'
import type { BlockingRelationship, SubtaskLink, Task, ViewSelectorVisibility } from './types'
import { DraggableList } from './DraggableList'
import { ArchiveView } from './ArchiveView'
import { LoadMoreSentinel } from './LoadMoreSentinel'
import { NewTaskInputField } from './NewTaskInputField'
import { rankAtInsertIndex } from './rank-utils'
import { QuickSelectPanel } from './QuickSelectPanel'
import { ViewModal } from './ViewModal'
import { theme } from './theme'
import { useOverscrollGesture } from './useOverscrollGesture'
import { useTasks, useStatuses, useViews } from './tasks-context'
import { OverscrollIndicator } from './OverscrollIndicator'
import { VIEW_SELECTOR_VISIBILITY_KEY } from './storage'
import { ARCHIVE_VIEW_SLUG, isUserDefinedView } from './synthetic-view-utils'
import {
  archivedTasksOf,
  displayedTasksForView,
  sectionTasksForStatus,
  sortArchivedTasks,
  DEFAULT_SECTION_PAGING,
} from './view-utils'

const OVERSCROLL_TRIGGER_DISTANCE = 100

function isIosPwa(): boolean {
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

function shouldShowViewSelectorButton(): boolean {
  const visibility = localStorage.getItem(VIEW_SELECTOR_VISIBILITY_KEY) as ViewSelectorVisibility
  if (visibility === 'always-show') return true
  if (visibility === 'always-hide') return false
  return !isIosPwa()
}

type MainPageProps = {
  onNavigateToSettings: () => void
}

type NewTaskInput = {
  sectionIndex: number
  insertIndex: number
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

export function TaskRow({ task, onDoneChange, showIndicator, isBlocked, parentTaskName }: { task: Task; onDoneChange: (done: boolean) => void; showIndicator?: boolean; isBlocked: boolean; parentTaskName?: string }) {
  return (
    <>
      <input
        type="checkbox"
        checked={task.completedAt !== null}
        onChange={(e) => onDoneChange(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
      />
      <span style={task.completedAt !== null ? { color: theme.colors.textDisabled } : undefined}>
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
    sectionPaging,
    requestTaskPage,
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
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [modalTaskId, setModalTaskId] = useState<number | null>(null)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [blockingRelationships, setBlockingRelationships] = useState<BlockingRelationship[]>([])
  const [subtaskLinks, setSubtaskLinks] = useState<SubtaskLink[]>([])

  useEffect(() => {
    loadAllBlocks().then(setBlockingRelationships)
    loadAllSubtaskLinks().then(setSubtaskLinks)
  }, [])

  const inputKeyRef = useRef(0)

  const noModalOpen = selectedTaskId === null && !viewModalOpen && modalTaskId === null
  const { pullDistance, isTouching } = useOverscrollGesture({
    enabled: noModalOpen,
    threshold: OVERSCROLL_TRIGGER_DISTANCE,
    onTrigger: () => setViewModalOpen(true),
  })

  const currentView = views.find((v) => v.slug === currentViewSlug)

  const requestTaskPageRef = useRef(requestTaskPage)
  requestTaskPageRef.current = requestTaskPage

  useEffect(() => {
    // Primes each of the current view's sections with their first page (a
    // no-op for a section that's already loaded or loading) - covers both the
    // very first view shown at startup and every subsequent view switch.
    if (!currentView) return
    if (isUserDefinedView(currentView)) {
      currentView.statusSlugs.forEach((slug) => requestTaskPageRef.current(slug))
    } else {
      requestTaskPageRef.current(ARCHIVE_VIEW_SLUG) // TODO: slug -> id (might want to indicate this isn't actually a slug somehow in the function)
    }
  }, [currentView])

  // Tasks shown across all sections of the current view, used below so the
  // cleanup effect can clear indicators for whatever was actually on screen
  // right before the view changes. Archived tasks are excluded here (they're
  // no longer part of their status) but not from `tasks` itself - subtask and
  // relationship lookups elsewhere still need to see them.
  const displayedTasks = useMemo(
    () => (currentView && isUserDefinedView(currentView) ? displayedTasksForView(tasks, currentView) : []),
    [currentView, tasks]
  )

  const archivedTasks = useMemo(() => sortArchivedTasks(archivedTasksOf(tasks)), [tasks])

  const archivedPaging = sectionPaging[ARCHIVE_VIEW_SLUG] ?? DEFAULT_SECTION_PAGING
  const archiveFooter = archivedPaging.isLoading || archivedPaging.hasMore
    ? <LoadMoreSentinel isLoading={archivedPaging.isLoading} onVisible={() => requestTaskPageRef.current(ARCHIVE_VIEW_SLUG)} />
    : undefined // TODO: this is duplicated below for standard pages. maybe put in shared prop list

  const parentTaskNameByChildId = useMemo(
    () =>
      new Map(
        subtaskLinks
          .map((link) => {
            const parentTask = tasks.find((t) => t.id === link.parentTaskId)
            return parentTask ? [link.childTaskId, parentTask.name] as const : undefined
          })
          .filter((entry): entry is [number, string] => entry !== undefined)
      ),
    [subtaskLinks, tasks]
  )

  const sections = useMemo(
    () =>
      currentView && isUserDefinedView(currentView)
        ? currentView.statusSlugs.map((slug) => {
            const status = statuses.find((s) => s.slug === slug)
            const paging = sectionPaging[slug] ?? DEFAULT_SECTION_PAGING
            return {
              header: (
                <h2 style={{ padding: '16px 16px 8px', margin: 0, fontSize: theme.fontSizes.xxl, fontWeight: 700 }}>
                  {status?.name ?? slug}
                </h2>
              ),
              items: sectionTasksForStatus(tasks, slug),
              footer: paging.isLoading || paging.hasMore
                ? <LoadMoreSentinel isLoading={paging.isLoading} onVisible={() => requestTaskPageRef.current(slug)} />
                : undefined,
            }
          })
        : [],
    [currentView, statuses, tasks, sectionPaging]
  )

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
    if (!currentView || !isUserDefinedView(currentView)) return
    const toStatusSlug = currentView.statusSlugs[toSectionIndex]
    const toSectionTasks = tasks.filter((t) => t.statusSlug === toStatusSlug)
    const newRank = rankAtInsertIndex(toSectionTasks, insertIndex, draggedId)
    const needsStatusChange = !toSectionTasks.some((t) => t.id === draggedId)
    moveTask(draggedId, toStatusSlug, newRank, needsStatusChange)
  }

  function buildPanelProps(
    task: Task,
    { onClose, onAfterChangeStatus, onAfterDelete }: {
      onClose: () => void
      onAfterChangeStatus: () => void
      onAfterDelete: () => void
    }
  ) {
    return {
      task,
      allTasks: tasks,
      statuses,
      onClose,
      onChangeStatus: async (id: number, statusSlug: string) => {
        await setStatus(id, statusSlug)
        onAfterChangeStatus()
      },
      onDelete: async (id: number) => {
        await deleteTask(id)
        onAfterDelete()
      },
      onOpenTask: (id: number) => setModalTaskId(id),
      onBlockingRelationshipAdded: () => loadAllBlocks().then(setBlockingRelationships),
      onSubtaskLinkAdded: () => loadAllSubtaskLinks().then(setSubtaskLinks),
    }
  }

  async function commitInput(value: string, sectionIndex: number, insertIndex: number, andOpenAnother: boolean) {
    const trimmed = value.trim()
    if (!trimmed) {
      setNewTaskInput(null)
      return
    }
    if (!currentView || !isUserDefinedView(currentView)) return
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

  const selectedTask = selectedTaskId !== null ? tasks.find((t) => t.id === selectedTaskId) ?? null : null

  const quickSelectPanelProps = selectedTask
    ? buildPanelProps(selectedTask, {
        onClose: () => setSelectedTaskId(null),
        onAfterChangeStatus: () => setSelectedTaskId(null),
        onAfterDelete: () => setSelectedTaskId(null),
      })
    : null

  const modalTask = modalTaskId !== null ? tasks.find((t) => t.id === modalTaskId) ?? null : null

  const relatedTaskModalProps = modalTask
    ? buildPanelProps(modalTask, {
        onClose: () => setModalTaskId(null),
        onAfterChangeStatus: () => setModalTaskId(null),
        onAfterDelete: () => setModalTaskId(null),
      })
    : null

  const itemStyleFn = (task: Task) => {
    const isSelected = task.id === selectedTaskId
    const isFaded = selectedTaskId !== null && !isSelected
    return {
      opacity: isFaded ? 0.4 : 1,
      backgroundColor: isSelected ? theme.colors.selected : 'transparent',
    }
  }

  const renderTaskRow = (task: Task) => (
    <TaskRow
      task={task}
      onDoneChange={(done) => setDone(task.id, done)}
      showIndicator={autoTransitionedTaskIds.has(task.id)}
      isBlocked={blockingRelationships.some((r) => r.toTaskId === task.id)}
      parentTaskName={parentTaskNameByChildId.get(task.id)}
    />
  )

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
    : undefined

  const expandedSlot = quickSelectPanelProps
    ? {
        afterItemId: quickSelectPanelProps.task.id,
        content: <QuickSelectPanel {...quickSelectPanelProps} />,
      }
    : undefined

  const sharedListProps = {
    renderItem: renderTaskRow,
    onItemClick: selectedTaskId === null ? handleTaskClick : undefined,
    itemStyle: itemStyleFn,
    expandedSlot,
  }

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
    <OverscrollIndicator overscrollPct={overscrollPct} overscrollArmed={overscrollArmed} />
  )

  return (
    <main
      onClick={() => setSelectedTaskId(null)}
      style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      {shouldShowViewSelectorButton() && (
        <ViewSelectorButton
          viewName={currentView.name}
          onClick={() => setViewModalOpen(true)}
        />
      )}

      {!isUserDefinedView(currentView) ? (
        <ArchiveView tasks={archivedTasks} footer={archiveFooter} {...sharedListProps} />
      ) : (
        <DraggableList
          sections={sections}
          onReorder={handleReorder}
          insertSlot={insertSlot}
          insertButton={{ onRequestInsert: openInput }}
          {...sharedListProps}
        />
      )}

      <SettingsButton onClick={onNavigateToSettings} />

      {overscrollIndicator}
      {viewModal}
      {relatedTaskModal}
    </main>
  )
}
