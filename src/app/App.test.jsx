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
import { levelForControlMode } from './controlMode.js'

describe('App', () => {
  afterEach(cleanup)

  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('path-protocol.campaign-theme', 'default')
    window.confirm = vi.fn(() => true)
    window.history.replaceState({}, '', '/')
    global.fetch = vi.fn(async (url) => {
      if (String(url) === '/api/themes') {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () =>
            JSON.stringify({
              themes: [
                {
                  id: 'default',
                  name: 'Default',
                  description: 'Official campaign',
                  levelCount: 100,
                },
              ],
            }),
        }
      }
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

  it('offers every public theme to a first-time visitor', async () => {
    window.localStorage.removeItem('path-protocol.campaign-theme')
    global.fetch.mockImplementation(async (url) => {
      if (String(url) === '/api/themes') {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () =>
            JSON.stringify({
              themes: [
                {
                  id: 'default',
                  name: 'Default',
                  description: 'Official campaign',
                  levelCount: 100,
                },
                {
                  id: 'community-course',
                  name: 'Community Course',
                  description: 'A published player campaign',
                  levelCount: 12,
                },
              ],
            }),
        }
      }
      if (String(url).includes('/manifests/')) {
        return { ok: true, json: async () => mediaManifest }
      }
      return {
        ok: true,
        text: async () =>
          '<svg viewBox="0 0 100 100"><path d="M0 0h100v100H0z"/></svg>',
      }
    })

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /start game/i }))
    expect(
      await screen.findByRole('heading', { name: /pick a public theme/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /play community course/i }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /play default/i }))
    expect(
      await screen.findByRole('heading', { name: /find the line/i }),
    ).toBeInTheDocument()
    expect(window.localStorage.getItem('path-protocol.campaign-theme')).toBe(
      'default',
    )
  })

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

  it('persists the home movement toggle and applies ricochet to campaign play', async () => {
    await boot()
    const guided = screen.getByRole('button', { name: 'Guided' })
    const ricochet = screen.getByRole('button', { name: 'Ricochet' })

    expect(guided).toHaveAttribute('aria-pressed', 'true')
    expect(ricochet).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(ricochet)

    expect(ricochet).toHaveAttribute('aria-pressed', 'true')
    expect(
      JSON.parse(window.localStorage.getItem('path-protocol.progress')).settings
        .controlMode,
    ).toBe('kinetic')

    fireEvent.click(screen.getByRole('button', { name: /begin calibration/i }))
    expect(
      screen.getByRole('application', { name: /foundation 01 obstacle course/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('Shots launched')).toBeInTheDocument()
  })

  it('unlocks every level and exposes diagnostics in developer playtest mode', async () => {
    window.history.replaceState({}, '', '/?dev=1')
    await boot()

    expect(screen.getByText(/dev playtest/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /select level/i }))
    const finalLevel = screen.getByRole('button', { name: /100.*round green/i })
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
      screen.getByRole('button', { name: /100.*round green/i }),
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

  it('shows kinetic par rating and campaign shot records on results', () => {
    render(
      <Results
        level={{ id: 'level-999', number: 999 }}
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
          shotsTaken: 3,
          shotPar: 4,
          shotRating: 'under-par',
        }}
        improved
        cumulative={900}
        campaignShots={12}
        onReplay={() => {}}
        onNext={() => {}}
        onLevels={() => {}}
        devMode={false}
        protocols={[]}
        microRecords={{}}
        microNotice={null}
        onMicro={() => {}}
      />,
    )

    expect(screen.getByText('Shots used')).toBeInTheDocument()
    expect(screen.getByText(/under par · par 4 · 12 campaign-best shots/i)).toBeInTheDocument()
  })

  it('projects either movement mode without mutating authored levels', () => {
    const configured = {
      id: 'level-999',
      shotMechanic: { maximumLaunchSpeed: 800 },
    }
    const guidedLevel = { id: 'level-01' }
    const defaults = { maximumLaunchSpeed: 700, stopSpeed: 30 }

    expect(levelForControlMode(configured, 'guided')).toEqual({ id: 'level-999' })
    expect(levelForControlMode(configured, 'kinetic', defaults)).toEqual(configured)
    expect(levelForControlMode(guidedLevel, 'kinetic', defaults)).toEqual({
      id: 'level-01',
      shotMechanic: defaults,
    })
    expect(configured).toHaveProperty('shotMechanic')
    expect(guidedLevel).not.toHaveProperty('shotMechanic')
  })
})
