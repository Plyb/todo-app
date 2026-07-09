import { useEffect, useRef, useState } from 'react'
import PullToRefresh from 'pulltorefreshjs'
import { createTask, deleteTask, updateTaskDone, updateTaskName, updateTaskNotes, updateTaskRank, updateTaskStatus, type Task, type Status } from './tasks'
import { DraggableList } from './DraggableList'
import { AddTaskFab, NewTaskInputField, computeInsertRank, type NewTaskInput } from './AddTaskInput'
import { rankBetween } from './rank-utils'
import { QuickSelectPanel } from './QuickSelectPanel'
import { StatusModal } from './StatusModal'

type MainPageProps = {
  tasks: Task[]
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>
  statuses: Status[]
  currentStatusSlug: string
  recentStatusSlugs: string[]
  onOpenStatus: (slug: string) => void
  onNavigateToSettings: () => void
}

function computeNewRank(tasks: Task[], insertIndex: number, draggedTaskId: number): string {
  const others = tasks.filter((t) => t.id !== draggedTaskId)
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

function TaskRow({ task, onDoneChange }: { task: Task; onDoneChange: (done: boolean) => void }) {
  return (
    <>
      <input
        type="checkbox"
        checked={task.done}
        onChange={(e) => onDoneChange(e.target.checked)}
      />
      <span style={task.done ? { color: '#aaa' } : undefined}>
        {task.name}
      </span>
    </>
  )
}

export default function MainPage({
  tasks,
  setTasks,
  statuses,
  currentStatusSlug,
  recentStatusSlugs,
  onOpenStatus,
  onNavigateToSettings,
}: MainPageProps) {
  const [newTaskInput, setNewTaskInput] = useState<NewTaskInput | null>(null)
  const [fabPlaceholderIndex, setFabPlaceholderIndex] = useState<number | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [statusModalOpen, setStatusModalOpen] = useState(false)

  const listRef = useRef<HTMLUListElement>(null)
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
        setStatusModalOpen(true)
      },
      shouldPullToRefresh() {
        return !isDraggingRef.current && window.scrollY === 0
      },
    })
    return () => ptr.destroy()
  }, [])

  const displayedTasks = tasks.filter((t) => t.statusSlug === currentStatusSlug)

  function openInput(insertIndex: number) {
    inputKeyRef.current++
    setNewTaskInput({ insertIndex })
  }

  function handleDoneChange(id: number, done: boolean) {
    updateTaskDone(id, done)
    setTasks(tasks.map((t) => (t.id === id ? { ...t, done } : t)))
  }

  function handleUpdateNotes(id: number, notes: string) {
    updateTaskNotes(id, notes)
    setTasks(tasks.map((t) => (t.id === id ? { ...t, notes } : t)))
  }

  function handleReorder(draggedId: number, insertIndex: number) {
    const newRank = computeNewRank(displayedTasks, insertIndex, draggedId)
    const others = tasks.filter((t) => t.id !== draggedId)
    const draggedTask = tasks.find((t) => t.id === draggedId)!
    const updatedDragged = { ...draggedTask, rank: newRank }
    const newTasks = others.map((t) => t)
    // insert updatedDragged at correct position in full tasks array preserving sort
    newTasks.push(updatedDragged)
    newTasks.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
    setTasks(newTasks)
    updateTaskRank(draggedId, newRank)
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

  async function commitInput(value: string, insertIndex: number, andOpenAnother: boolean) {
    const trimmed = value.trim()
    if (!trimmed) {
      setNewTaskInput(null)
      return
    }
    const rank = computeInsertRank(displayedTasks, insertIndex)
    const task = await createTask(trimmed, rank, currentStatusSlug)
    setTasks((prev) => {
      const next = [...prev, task]
      next.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
      return next
    })
    if (andOpenAnother) {
      openInput(insertIndex + 1)
    } else {
      setNewTaskInput(null)
    }
  }

  function handleInputBlur(e: React.FocusEvent<HTMLInputElement>, insertIndex: number) {
    commitInput(e.currentTarget.value, insertIndex, false)
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>, insertIndex: number) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitInput(e.currentTarget.value, insertIndex, true)
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

  const insertSlot = newTaskInput !== null
    ? {
        index: newTaskInput.insertIndex,
        content: (
          <NewTaskInputField
            key={inputKeyRef.current}
            insertIndex={newTaskInput.insertIndex}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
          />
        ),
      }
    : fabPlaceholderIndex !== null
    ? {
        index: fabPlaceholderIndex,
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

  const selectedTask = selectedTaskId !== null ? tasks.find((t) => t.id === selectedTaskId) ?? null : null

  return (
    <main
      onClick={selectedTask === null ? () => setSelectedTaskId(null) : undefined}
      style={{ minHeight: '100vh' }}
    >
      <DraggableList
        items={displayedTasks}
        onReorder={handleReorder}
        renderItem={(task) => (
          <TaskRow task={task} onDoneChange={(done) => handleDoneChange(task.id, done)} />
        )}
        listRef={listRef}
        insertSlot={insertSlot}
        onItemClick={selectedTaskId === null ? handleTaskClick : undefined}
        onDragStart={() => { isDraggingRef.current = true }}
        onDragEnd={() => { isDraggingRef.current = false }}
        itemStyle={(task) => {
          const isSelected = task.id === selectedTaskId
          const isFaded = selectedTaskId !== null && !isSelected
          return {
            opacity: isFaded ? 0.4 : 1,
            backgroundColor: isSelected ? '#e8f0fe' : 'transparent',
          }
        }}
        expandedSlot={selectedTask ? {
          afterItemId: selectedTask.id,
          content: (
            <QuickSelectPanel
              task={selectedTask}
              allTasks={tasks}
              statuses={statuses}
              recentStatusSlugs={recentStatusSlugs}
              onClose={() => setSelectedTaskId(null)}
              onRename={handleRename}
              onChangeStatus={handleChangeStatus}
              onDelete={handleDelete}
              onUpdateNotes={handleUpdateNotes}
              onOpenTask={(id) => setSelectedTaskId(id)}
              onDoneChange={handleDoneChange}
            />
          ),
        } : undefined}
      />

      <SettingsButton onClick={onNavigateToSettings} />

      <AddTaskFab
        tasks={displayedTasks}
        listRef={listRef}
        onRequestInsert={openInput}
        onDragInsertIndex={setFabPlaceholderIndex}
      />

      {statusModalOpen && (
        <StatusModal
          statuses={statuses}
          recentStatusSlugs={recentStatusSlugs}
          currentStatusSlug={currentStatusSlug}
          onSelect={onOpenStatus}
          onClose={() => setStatusModalOpen(false)}
        />
      )}
    </main>
  )
}
