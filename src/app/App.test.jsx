import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.confirm = vi.fn(() => true)
  })

  it('opens the protocol archive and starts the unlocked first level', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /select level/i }))
    expect(screen.getByRole('heading', { name: /select a chamber/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /01.*calibration/i }))
    expect(screen.getByRole('application', { name: /calibration obstacle course/i })).toBeInTheDocument()
  })

  it('shows the operator field guide', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /how the protocol works/i }))
    expect(screen.getByRole('heading', { name: /one drag/i })).toBeInTheDocument()
  })
})
