import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.confirm = vi.fn(() => true)
    window.history.replaceState({}, '', '/')
  })

  it('opens the protocol archive and starts the unlocked first level', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /select level/i }))
    expect(screen.getByRole('heading', { name: /select a chamber/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /01.*calibration/i }))
    expect(screen.getByRole('application', { name: /calibration obstacle course/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /restart attempt/i })).toBeInTheDocument()
  })

  it('shows the operator field guide', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /how the protocol works/i }))
    expect(screen.getByRole('heading', { name: /one drag/i })).toBeInTheDocument()
  })

  it('unlocks every level and exposes diagnostics in developer playtest mode', () => {
    window.history.replaceState({}, '', '/?dev=1')
    render(<App />)

    expect(screen.getByText(/dev playtest/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /select level/i }))
    const finalLevel = screen.getByRole('button', { name: /10.*final protocol/i })
    expect(finalLevel).toBeEnabled()
    fireEvent.click(finalLevel)

    expect(screen.getByTestId('playtest-diagnostics')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /previous playtest level/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /next playtest level/i })).toBeDisabled()
  })
})
