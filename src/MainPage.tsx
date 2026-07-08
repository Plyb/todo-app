import { useRef, useState } from 'react'
import { createTask, updateTaskRank, type Task } from './tasks'
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

export default function MainPage({ tasks, setTasks, onNavigateToSettings }: MainPageProps) {
  const [newTaskInput, setNewTaskInput] = useState<NewTaskInput | null>(null)

  const listRef = useRef<HTMLUListElement>(null)

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
      setNewTaskInput({ insertIndex: insertIndex + 1 })
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
            insertIndex={newTaskInput.insertIndex}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
          />
        ),
      }
    : undefined

  return (
    <main>
      <DraggableList
        items={tasks}
        onReorder={handleReorder}
        renderItem={(task) => task.name}
        listRef={listRef}
        insertSlot={insertSlot}
      />

      <SettingsButton onClick={onNavigateToSettings} />

      <AddTaskFab
        tasks={tasks}
        listRef={listRef}
        onRequestInsert={(insertIndex) => setNewTaskInput({ insertIndex })}
      />
    </main>
  )
}
