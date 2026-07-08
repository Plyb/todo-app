type SettingsPageProps = {
  onBack: () => void
}

export default function SettingsPage({ onBack }: SettingsPageProps) {
  return (
    <main>
      <button onClick={onBack} style={{ position: 'fixed', top: 16, left: 16 }}>
        ←
      </button>
    </main>
  )
}
