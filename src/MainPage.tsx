import { useRef, useState } from 'react'
import { createTask, updateTaskDone, updateTaskRank, type Task } from './tasks'
import { DraggableList } from './DraggableList'
import { AddTaskFab, NewTaskInputField, computeInsertRank, type NewTaskInput } from './AddTaskInput'
import { rankBetween } from './rank-utils'

type MainPageProps = {
  tasks: Task[]
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>
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

export default function MainPage({ tasks, setTasks, onNavigateToSettings }: MainPageProps) {
  const [newTaskInput, setNewTaskInput] = useState<NewTaskInput | null>(null)
  const [fabPlaceholderIndex, setFabPlaceholderIndex] = useState<number | null>(null)

  const listRef = useRef<HTMLUListElement>(null)
  const inputKeyRef = useRef(0)

  function openInput(insertIndex: number) {
    inputKeyRef.current++
    setNewTaskInput({ insertIndex })
  }

  function handleDoneChange(id: number, done: boolean) {
    updateTaskDone(id, done)
    setTasks(tasks.map((t) => (t.id === id ? { ...t, done } : t)))
  }

  function handleReorder(draggedId: number, insertIndex: number) {
    const newRank = computeNewRank(tasks, insertIndex, draggedId)
    const others = tasks.filter((t) => t.id !== draggedId)
    const draggedTask = tasks.find((t) => t.id === draggedId)!
    const updatedDragged = { ...draggedTask, rank: newRank }
    const newTasks = [
      ...others.slice(0, insertIndex),
      updatedDragged,
      ...others.slice(insertIndex),
    ]
    setTasks(newTasks)
    updateTaskRank(draggedId, newRank)
  }

  async function commitInput(value: string, insertIndex: number, andOpenAnother: boolean) {
    const trimmed = value.trim()
    if (!trimmed) {
      setNewTaskInput(null)
      return
    }
    const rank = computeInsertRank(tasks, insertIndex)
    const task = await createTask(trimmed, rank)
    setTasks((prev) => {
      const next = [...prev]
      next.splice(insertIndex, 0, task)
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

  return (
    <main>
      <DraggableList
        items={tasks}
        onReorder={handleReorder}
        renderItem={(task) => (
          <TaskRow task={task} onDoneChange={(done) => handleDoneChange(task.id, done)} />
        )}
        listRef={listRef}
        insertSlot={insertSlot}
      />

      <SettingsButton onClick={onNavigateToSettings} />

      <AddTaskFab
        tasks={tasks}
        listRef={listRef}
        onRequestInsert={openInput}
        onDragInsertIndex={setFabPlaceholderIndex}
      />
    </main>
  )
}
