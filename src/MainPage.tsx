import { type Task } from './tasks'

type MainPageProps = {
  tasks: Task[]
  onNavigateToSettings: () => void
}

export default function MainPage({ tasks, onNavigateToSettings }: MainPageProps) {
  return (
    <main>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>{task.name}</li>
        ))}
      </ul>
      <button
        onClick={onNavigateToSettings}
        style={{ position: 'fixed', bottom: 16, left: 16 }}
      >
        ⚙
      </button>
    </main>
  )
}
