import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mediaManifest from '../../public/media/manifests/future-lab.json'

vi.mock('howler', () => {
  class MockHowl {
    constructor() {
      this.handlers = new Map()
    }
    once(event, handler) { this.handlers.set(event, handler) }
    off(event) { this.handlers.delete(event) }
    load() { queueMicrotask(() => this.handlers.get('load')?.()) }
    volume() { return 0 }
    play() { return 1 }
    fade() {}
    unload() {}
  }
  return { Howl: MockHowl, Howler: {} }
})

import App, { ConfigurationErrorScreen, Results } from './App.jsx'

describe('App', () => {
  afterEach(cleanup)

  beforeEach(() => {
    window.localStorage.clear()
    window.confirm = vi.fn(() => true)
    window.history.replaceState({}, '', '/')
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('/manifests/')) {
        return { ok: true, json: async () => mediaManifest }
      }
      return {
        ok: true,
        text: async () => '<svg viewBox="0 0 100 100"><path d="M0 0h100v100H0z"/></svg>',
      }
    })
  })

  async function boot() {
    render(<App />)
    expect(screen.getByRole('heading', { name: /starting up/i })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /start game/i }))
    await screen.findByRole('heading', { name: /find the line/i })
  }

  it('opens the protocol archive and starts the unlocked first level', async () => {
    await boot()
    fireEvent.click(screen.getByRole('button', { name: /select level/i }))
    expect(screen.getByRole('heading', { name: /select a chamber/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /01.*foundation 01/i }))
    expect(screen.getByRole('application', { name: /foundation 01 obstacle course/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /restart attempt/i })).toBeInTheDocument()
  })

  it('shows the operator field guide', async () => {
    await boot()
    fireEvent.click(screen.getByRole('button', { name: /how the protocol works/i }))
    expect(screen.getByRole('heading', { name: /one route/i })).toBeInTheDocument()
  })

  it('opens the power lab with five numbered consumable powers', async () => {
    await boot()
    fireEvent.click(screen.getByRole('button', { name: /power lab/i }))

    expect(screen.getByRole('heading', { name: /convert coins/i })).toBeInTheDocument()
    expect(screen.getByText(/obstacle shield/i)).toBeInTheDocument()
    expect(screen.getByText(/route scan/i)).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(5)
  })

  it('offers a visible power-up purchase action on the home screen', async () => {
    await boot()
    fireEvent.click(screen.getByRole('button', { name: /buy power-ups/i }))
    expect(screen.getByRole('heading', { name: /convert coins/i })).toBeInTheDocument()
  })

  it('unlocks every level and exposes diagnostics in developer playtest mode', async () => {
    window.history.replaceState({}, '', '/?dev=1')
    await boot()

    expect(screen.getByText(/dev playtest/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /select level/i }))
    const finalLevel = screen.getByRole('button', { name: /100.*convergence 10/i })
    expect(finalLevel).toBeEnabled()
    fireEvent.click(finalLevel)

    expect(screen.getByTestId('playtest-diagnostics')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /previous playtest level/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /next playtest level/i })).toBeDisabled()
  })

  it('toggles developer playtest mode from the home screen', async () => {
    window.history.replaceState({}, '', '/?dev=0')
    await boot()

    const toggle = screen.getByRole('button', { name: 'Dev mode' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(window.location.search).toBe('?dev=1')

    fireEvent.click(screen.getByRole('button', { name: /select level/i }))
    expect(
      screen.getByRole('button', { name: /100.*convergence 10/i }),
    ).toBeEnabled()
  })

  it('persists and loads any selected built-in presentation theme', async () => {
    await boot()
    fireEvent.click(screen.getByRole('button', { name: /controls/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /presentation theme/i }), {
      target: { value: 'casual' },
    })

    expect(window.localStorage.getItem('path-protocol.presentation-theme')).toBe(
      'casual',
    )
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/media/manifests/casual.json'),
      )
    })
  })

  it('shows a safe configuration error with development diagnostics', () => {
    render(<ConfigurationErrorScreen errors={['level-01/token: mediaId is required']} />)

    expect(
      screen.getByRole('heading', { name: /could not initialize/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/mediaId is required/i)).toBeInTheDocument()
  })

  it('offers optional Micro Protocols from the completion screen', () => {
    const onMicro = vi.fn()
    render(
      <Results
        level={{ id: 'level-01', number: 1 }}
        result={{
          routeFactor: 0.9,
          timeFactor: 0.8,
          finalScore: 900,
          attainableMaximum: 1000,
          elapsedMs: 6000,
          actualDistance: 800,
          collisions: 0,
          collisionPenalty: 0,
          earnedBonuses: 0,
        }}
        improved
        cumulative={900}
        onReplay={() => {}}
        onNext={() => {}}
        onLevels={() => {}}
        devMode={false}
        protocols={[
          {
            id: 'phase-window',
            name: 'Phase Window',
            description: 'Cross two synchronized gates.',
            rewardCoins: 3,
            kind: 'timing',
          },
        ]}
        microRecords={{}}
        microNotice={null}
        onMicro={onMicro}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /phase window/i }),
    )
    expect(onMicro).toHaveBeenCalledWith('phase-window')
    expect(screen.getByText(/separate from campaign score/i)).toBeInTheDocument()
  })
})
