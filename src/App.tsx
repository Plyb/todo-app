import { useState } from 'react'
import { TasksProvider } from './TasksProvider'
import MainPage from './MainPage'
import SettingsPage from './SettingsPage'

type Page = 'main' | 'settings'

export default function App() {
  const [page, setPage] = useState<Page>('main')

  return (
    <TasksProvider>
      {page === 'settings' ? (
        <SettingsPage onBack={() => setPage('main')} />
      ) : (
        <MainPage onNavigateToSettings={() => setPage('settings')} />
      )}
    </TasksProvider>
  )
}
