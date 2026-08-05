import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { levels } from '../../../config/loadConfig.js'
import { generateLevel } from '../../generation/levelGenerator.js'
import {
  createThreeApplication,
  destroyThreeApplication,
} from './ThreeApplication.js'
import ThreeCanvas from './ThreeCanvas.jsx'
import {
  createTerrainMesh,
  ThreeSceneRenderer,
} from './ThreeSceneRenderer.js'

describe('V3 Three.js renderer', () => {
  it('creates and disposes a WebGL renderer facade', async () => {
    const canvas = document.createElement('canvas')
    class FakeRenderer {
      constructor(options) {
        this.options = options
        this.domElement = canvas
        this.shadowMap = {}
        this.setPixelRatio = vi.fn()
        this.setSize = vi.fn()
        this.dispose = vi.fn()
        this.forceContextLoss = vi.fn()
      }
    }
    const app = await createThreeApplication({
      container: { clientWidth: 800, clientHeight: 450 },
      RendererClass: FakeRenderer,
      resolution: 3,
    })
    expect(app.renderer.options).toMatchObject({ antialias: true, alpha: true })
    expect(app.renderer.setPixelRatio).toHaveBeenCalledWith(2)
    expect(canvas.dataset.renderer).toBe('three-webgl')
    destroyThreeApplication(app)
    expect(app.renderer.dispose).toHaveBeenCalledOnce()
    expect(app.renderer.forceContextLoss).toHaveBeenCalledOnce()
  })

  it('projects the screen center onto the center of the logical ground plane', () => {
    const level = generateLevel(levels[0])
    const app = {
      canvas: { clientWidth: 1600, clientHeight: 900, dataset: {} },
      renderer: { setSize: vi.fn(), render: vi.fn() },
    }
    const renderer = new ThreeSceneRenderer({ app, level })
    renderer.resize(1600, 900)
    const point = renderer.screenToWorld({ x: 800, y: 450 })
    expect(point.x).toBeCloseTo(800, 4)
    expect(point.y).toBeCloseTo(450, 4)
    renderer.destroy()
  })

  it('builds terrain triangles from the authoritative corner elevations', () => {
    const mesh = createTerrainMesh({
      id: 'renderer-slope',
      x: 800,
      y: 450,
      width: 200,
      height: 100,
      thickness: 10,
      cornerElevations: {
        northWest: 0,
        northEast: 80,
        southEast: 80,
        southWest: 0,
      },
    })
    const positions = mesh.geometry.getAttribute('position')

    expect([0, 1, 2, 3, 4, 5].map((index) => positions.getY(index))).toEqual([
      0, 80, 80, 0, 0, 80,
    ])
    const normals = mesh.geometry.getAttribute('normal')
    expect(normals.getX(0)).toBeCloseTo(-0.4 / Math.hypot(0.4, 1))
    expect(normals.getY(0)).toBeCloseTo(1 / Math.hypot(0.4, 1))
    mesh.geometry.dispose()
    mesh.material.dispose()
  })

  it('caches catalog loads and applies an authored obstacle model', async () => {
    const level = generateLevel(levels[0])
    const app = {
      canvas: { clientWidth: 1600, clientHeight: 900, dataset: {} },
      renderer: { setSize: vi.fn(), render: vi.fn() },
    }
    const renderer = new ThreeSceneRenderer({ app, level })
    const source = new Group()
    source.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()))
    renderer.modelLoader.loadAsync = vi.fn(async () => ({ scene: source }))

    const first = renderer.loadCatalogModel('kenney-minigolf-windmill')
    const second = renderer.loadCatalogModel('kenney-minigolf-windmill')
    expect(first).toBe(second)
    await first
    expect(renderer.modelLoader.loadAsync).toHaveBeenCalledOnce()

    const item = {
      id: 'authored-windmill',
      shape: 'rect',
      x: 500,
      y: 450,
      width: 120,
      height: 80,
    }
    renderer.addEntity(item, 0x7857c5)
    renderer.applyCatalogModel(
      {
        id: item.id,
        item,
        role: 'obstacle',
        modelId: 'kenney-minigolf-windmill',
      },
      source.clone(true),
    )
    expect(renderer.entities.get(item.id).userData.catalogModel).toBe(
      'kenney-minigolf-windmill',
    )
    renderer.destroy()
  })

  it('hits the visible elevated token and supports bounded camera adjustment', () => {
    const level = generateLevel(levels[0])
    const app = {
      canvas: { clientWidth: 1600, clientHeight: 900, dataset: {} },
      renderer: { setSize: vi.fn(), render: vi.fn() },
    }
    const renderer = new ThreeSceneRenderer({ app, level })
    renderer.resize(1600, 900)
    const token = renderer.addEntity(
      {
        ...level.token,
        id: 'token',
        x: level.startPoint.x,
        y: level.startPoint.y,
      },
      0x4aa8ff,
      'token',
    )
    token.updateMatrixWorld(true)
    const visibleCenter = renderer.worldToScreen({
      x: level.startPoint.x,
      y: level.startPoint.y,
      elevation: level.token.size / 2,
    })
    expect(renderer.tokenHitTest(visibleCenter)).toBe(true)
    expect(renderer.adjustCamera(15, 40)).toMatchObject({
      azimuthDegrees: 15,
      elevationDegrees: 72,
    })
    expect(app.canvas.dataset.cameraAzimuth).toBe('15')
    expect(renderer.resetCamera()).toEqual(renderer.defaultCameraState)
    renderer.destroy()
  })

  it('mounts exactly one Three canvas and disposes it on unmount', async () => {
    const canvas = document.createElement('canvas')
    const app = { canvas, renderer: { dispose: vi.fn(), forceContextLoss: vi.fn() } }
    const createApplication = vi.fn(async () => app)
    const onReady = vi.fn()
    const view = render(
      <ThreeCanvas createApplication={createApplication} onReady={onReady} />,
    )
    await waitFor(() => expect(onReady).toHaveBeenCalledOnce())
    expect(view.getByTestId('three-canvas').children).toHaveLength(1)
    view.unmount()
    expect(app.renderer.dispose).toHaveBeenCalledOnce()
  })
})
