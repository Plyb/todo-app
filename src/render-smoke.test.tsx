import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

function Greeting({ name }: { name: string }) {
  return <p>Hello, {name}!</p>
}

describe('React Testing Library setup', () => {
  it('renders a component into the jsdom environment', () => {
    render(<Greeting name="world" />)

    expect(screen.getByText('Hello, world!')).toBeInTheDocument()
  })
})
