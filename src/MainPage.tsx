import { useEffect, useRef, useState } from 'react'
import PullToRefresh from 'pulltorefreshjs'
import { createTask, deleteTask, loadAllBlocks, updateTaskDone, updateTaskName, updateTaskNotes, updateTaskRank, updateTaskStatus, type BlockingRelationship, type Task, type Status, type View } from './db'
import { DraggableList } from './DraggableList'
import { AddTaskFab, NewTaskInputField, computeInsertRank, type NewTaskInput, type InsertSlotTarget } from './AddTaskInput'
import { rankBetween } from './rank-utils'
import { QuickSelectPanel } from './QuickSelectPanel'
import { ViewModal } from './ViewModal'

type MainPageProps = {
  tasks: Task[]
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>
  statuses: Status[]
  views: View[]
  currentViewSlug: string
  recentViewSlugs: string[]
  onOpenView: (slug: string) => void
  onNavigateToSettings: () => void
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

function TaskRow({ task, onDoneChange, isBlocked }: { task: Task; onDoneChange: (done: boolean) => void; isBlocked: boolean }) {
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
}: MainPageProps) {
  const [newTaskInput, setNewTaskInput] = useState<NewTaskInput | null>(null)
  const [fabDragSlot, setFabDragSlot] = useState<InsertSlotTarget | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [blockingRelationships, setBlockingRelationships] = useState<BlockingRelationship[]>([])

  useEffect(() => {
    loadAllBlocks().then(setBlockingRelationships)
  }, [])

  const listRef = useRef<HTMLDivElement>(null)
  const inputKeyRef = useRef(0)
  const isDraggingRef = useRef(false)

  useEffect(() => {
    const ptr = PullToRefresh.init({
      mainElement: 'main',
      instructionsPullToRefresh: ' ',
      instructionsReleaseToRefresh: ' ',
      instructionsRefreshing: ' ',
      refreshTimeout: 100,
      onRefresh() {
        setViewModalOpen(true)
      },
      shouldPullToRefresh() {
        return !isDraggingRef.current && window.scrollY === 0
      },
    })
    return () => ptr.destroy()
  }, [])

  const currentView = views.find((v) => v.slug === currentViewSlug)

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

  return (
    <main
      onClick={() => setSelectedTaskId(null)}
      style={{ minHeight: '100vh' }}
    >
      <DraggableList
        sections={sections}
        onReorder={handleReorder}
        renderItem={(task) => (
          <TaskRow
            task={task}
            onDoneChange={(done) => handleDoneChange(task.id, done)}
            isBlocked={blockingRelationships.some((r) => r.toTaskId === task.id)}
          />
        )}
        listRef={listRef}
        insertSlot={insertSlot}
        onItemClick={selectedTaskId === null ? handleTaskClick : undefined}
        itemStyle={itemStyleFn}
        expandedSlot={expandedSlot}
        onDragStart={() => { isDraggingRef.current = true }}
        onDragEnd={() => { isDraggingRef.current = false }}
      />

      <SettingsButton onClick={onNavigateToSettings} />

      <AddTaskFab
        listRef={listRef}
        onRequestInsert={openInput}
        onDragInsertSlot={setFabDragSlot}
      />

      {viewModal}
    </main>
  )
}
