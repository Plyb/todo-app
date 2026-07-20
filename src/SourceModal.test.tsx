import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { SourceModal } from './SourceModal'
import type { TaskSource } from './sources'

afterEach(cleanup)

function makeSource(id: string): TaskSource {
  return { id } as TaskSource
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.startsWith(label))
  if (!button) throw new Error(`No button found for label ${label}`)
  return button
}

describe('SourceModal', () => {
  it('lists every source, marking the current one', () => {
    const { container } = render(
      <SourceModal
        sources={[makeSource('indexeddb'), makeSource('tasknotes')]}
        currentSourceId="tasknotes"
        onSelect={() => {}}
        onClose={() => {}}
      />
    )

    expect(findButton(container, 'indexeddb')).toHaveTextContent('indexeddb')
    expect(findButton(container, 'tasknotes')).toHaveTextContent('current')
  })

  it('reports the chosen source id and closes on selection', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    const { container } = render(
      <SourceModal
        sources={[makeSource('indexeddb'), makeSource('tasknotes')]}
        currentSourceId="indexeddb"
        onSelect={onSelect}
        onClose={onClose}
      />
    )

    findButton(container, 'tasknotes').click()

    expect(onSelect).toHaveBeenCalledWith('tasknotes')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
