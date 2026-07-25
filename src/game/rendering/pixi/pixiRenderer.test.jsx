import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { levels } from '../../../config/loadConfig.js'
import { generateLevel } from '../../generation/levelGenerator.js'
import { entityScale } from './EntityFactory.js'
import {
  createWebGLApplication,
  destroyWebGLApplication,
} from './PixiApplication.js'
import PixiCanvas from './PixiCanvas.jsx'
import { PixiSceneRenderer } from './PixiSceneRenderer.js'
import { PixiEngineAdapter } from './PixiEngineAdapter.js'
import { SCENE_LAYER_ORDER, createSceneLayers } from './SceneLayers.js'
import { VectorAssetCache } from './VectorAssetCache.js'
import {
  calculateViewport,
  screenToWorld,
  worldToScreen,
} from './Viewport.js'

class FakePoint {
  set(x, y = x) {
    this.x = x
    this.y = y
  }
}

class FakeContainer {
  constructor() {
    this.children = []
    this.position = new FakePoint()
    this.scale = new FakePoint()
    this.pivot = new FakePoint()
    this.visible = true
  }

  addChild(...children) {
    this.children.push(...children)
  }

  destroy = vi.fn()
}

class FakeGraphics extends FakeContainer {
  constructor(options = {}) {
    super()
    this.context = options.context
  }

  clear() { return this }
  moveTo() { return this }
  lineTo() { return this }
  closePath() { return this }
  rect() { return this }
  roundRect() { return this }
  ellipse() { return this }
  circle() { return this }
  fill() { return this }
  stroke() { return this }
}

class FakeContext {
  svg(value) {
    this.value = value
    return this
  }
}

describe('V2 PixiJS renderer', () => {
  it('selects WebGL explicitly and disposes renderer resources', async () => {
    class FakeApplication {
      constructor() {
        this.renderer = { name: 'WebGL', width: 800, height: 600 }
        this.ticker = { stop: vi.fn() }
        this.init = vi.fn()
        this.destroy = vi.fn()
      }
    }
    const app = await createWebGLApplication({
      container: {},
      ApplicationClass: FakeApplication,
      resolution: 3,
    })
    expect(app.init).toHaveBeenCalledWith(
      expect.objectContaining({ preference: 'webgl', resolution: 2 }),
    )
    destroyWebGLApplication(app)
    expect(app.ticker.stop).toHaveBeenCalled()
    expect(app.destroy).toHaveBeenCalledWith(true, {
      children: true,
      context: true,
    })
  })

  it('uniformly centers the 1000 by 1000 world and reverses pointer mapping', () => {
    const viewport = calculateViewport(1600, 900)
    expect(viewport).toMatchObject({ scale: 0.9, offsetX: 350, offsetY: 0 })
    const screen = worldToScreen({ x: 200, y: 300 }, viewport)
    expect(screenToWorld(screen, viewport)).toEqual({ x: 200, y: 300 })
  })

  it('reuses parsed SVG contexts and preserves category sizing rules', async () => {
    const fetchText = vi.fn(async () => '<svg viewBox="0 0 100 100"/>')
    const cache = new VectorAssetCache({
      fetchText,
      GraphicsContextClass: FakeContext,
    })
    const first = await cache.load({
      mediaId: 'token-a',
      src: '/shared.svg',
    })
    const second = await cache.load({
      mediaId: 'token-b',
      src: '/shared.svg',
    })
    expect(first).toBe(second)
    expect(fetchText).toHaveBeenCalledOnce()
    expect(entityScale(80, 40, 'tokens')).toEqual({ x: 0.4, y: 0.4 })
    expect(entityScale(80, 40, 'obstacles')).toEqual({ x: 0.8, y: 0.4 })
  })

  it('creates the documented scene order', () => {
    const { root } = createSceneLayers(FakeContainer)
    expect(root.children.map((child) => child.label)).toEqual(SCENE_LAYER_ORDER)
  })

  it('builds stable entities, updates transforms, and disposes the scene', async () => {
    const level = generateLevel(levels[0])
    const mediaIds = new Set([
      level.arena.mediaId,
      level.mainTarget.mediaId,
      level.token.mediaId,
      ...level.obstacles.map((item) => item.mediaId),
      ...level.coins.map((item) => item.mediaId),
    ])
    const manifest = {
      visuals: [...mediaIds].map((mediaId) => ({
        mediaId,
        category: mediaId.split('-')[0] === 'token' ? 'tokens' : 'obstacles',
      })),
    }
    const assetCache = { get: vi.fn(async (mediaId) => ({ mediaId })) }
    const app = {
      stage: new FakeContainer(),
      canvas: { dataset: {} },
      renderer: { width: 1200, height: 800, render: vi.fn() },
    }
    const renderer = new PixiSceneRenderer({
      app,
      level,
      manifest,
      assetCache,
      tokenCollisionTolerance: 4,
      classes: {
        ContainerClass: FakeContainer,
        GraphicsClass: FakeGraphics,
      },
    })
    await renderer.build()
    const token = renderer.entities.get('token')
    const entityCount = renderer.entities.size
    const session = {
      token: { position: { x: 321, y: 654 } },
      movingObstacles: [],
      trackingObstacles: [],
      collectedCoinIds: new Set(),
      trails: { active: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
    }
    renderer.update(session)
    expect(token.position).toMatchObject({ x: 321, y: 654 })
    expect(app.canvas.dataset.collisionTolerance).toBe('4')
    expect(renderer.layers.collisionGuide.children).toContain(
      renderer.collisionGuideGraphics,
    )
    expect(renderer.entities.size).toBe(entityCount)
    expect(app.renderer.render).toHaveBeenCalledOnce()
    renderer.destroy()
    expect(renderer.root.destroy).toHaveBeenCalled()
  })

  it('imperatively mounts exactly one canvas and destroys it on unmount', async () => {
    const canvas = document.createElement('canvas')
    const app = {
      canvas,
      ticker: { stop: vi.fn() },
      destroy: vi.fn(),
    }
    const createApplication = vi.fn(async () => app)
    const onReady = vi.fn()
    const view = render(
      <PixiCanvas
        createApplication={createApplication}
        onReady={onReady}
      />,
    )
    await waitFor(() => expect(onReady).toHaveBeenCalledOnce())
    expect(view.getByTestId('pixi-canvas').children).toHaveLength(1)
    view.unmount()
    expect(app.destroy).toHaveBeenCalledOnce()
  })

  it('keeps the WebGL canvas mounted when React callbacks change', async () => {
    const canvas = document.createElement('canvas')
    const app = { canvas, destroy: vi.fn() }
    const createApplication = vi.fn().mockResolvedValue(app)
    const firstReady = vi.fn()
    const secondReady = vi.fn()
    const view = render(
      <PixiCanvas
        createApplication={createApplication}
        onReady={firstReady}
      />,
    )
    await waitFor(() => expect(firstReady).toHaveBeenCalledOnce())

    view.rerender(
      <PixiCanvas
        createApplication={createApplication}
        onReady={secondReady}
      />,
    )

    expect(createApplication).toHaveBeenCalledOnce()
    expect(app.destroy).not.toHaveBeenCalled()
    expect(view.getByTestId('pixi-canvas').firstChild).toBe(canvas)
    view.unmount()
  })

  it('connects fixed engine updates to renderer frames without React state', () => {
    const engine = {
      step: vi.fn(),
      session: {},
      machine: { state: 'active-main' },
    }
    const renderer = { update: vi.fn(), destroy: vi.fn() }
    const adapter = new PixiEngineAdapter({
      engine,
      renderer,
      requestFrame: null,
      cancelFrame: null,
    })
    adapter.loop.start(0)
    adapter.advance(50)
    expect(engine.step).toHaveBeenCalledTimes(3)
    expect(renderer.update).toHaveBeenCalledWith(
      engine.session,
      'active-main',
    )
    adapter.destroy()
    expect(renderer.destroy).toHaveBeenCalledOnce()
  })

  it('immediately redraws a reset attempt and clears accumulated loop time', () => {
    const engine = {
      step: vi.fn(),
      session: { token: { position: { x: 120, y: 340 } } },
      machine: { state: 'ready' },
    }
    const renderer = { update: vi.fn(), destroy: vi.fn() }
    const adapter = new PixiEngineAdapter({
      engine,
      renderer,
      requestFrame: null,
      cancelFrame: null,
    })
    adapter.loop.start(0)
    adapter.advance(10)

    adapter.resetAttempt()

    expect(adapter.loop.accumulatorMs).toBe(0)
    expect(adapter.loop.simulationTimeMs).toBe(0)
    expect(renderer.update).toHaveBeenLastCalledWith(engine.session, 'ready')
  })

  it('publishes rendered FPS diagnostics without involving React state', () => {
    const engine = {
      session: {
        performance: { fps: 0, renderedFrames: 0, windowStartedAt: null },
      },
    }
    const renderer = { app: { canvas: { dataset: {} } }, destroy: vi.fn() }
    const adapter = new PixiEngineAdapter({
      engine,
      renderer,
      requestFrame: () => null,
      cancelFrame: () => {},
    })

    adapter.recordFrame(0)
    for (let frame = 1; frame <= 30; frame += 1) {
      adapter.recordFrame(frame * (1000 / 60))
    }
    expect(engine.session.performance.fps).toBeGreaterThanOrEqual(59)
    expect(renderer.app.canvas.dataset.fps).toBe('62')
  })
})
