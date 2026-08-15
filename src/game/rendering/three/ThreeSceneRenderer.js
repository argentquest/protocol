import {
  AmbientLight,
  Box3,
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { isSwitchActive } from '../../engine/SwitchSystem.js'
import {
  defaultModelForRole,
  getThreeModel,
  threeAssetUrl,
} from '../../media/threeModelCatalog.js'
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../world.js'

const HALF_WORLD_WIDTH = WORLD_WIDTH / 2
const HALF_WORLD_HEIGHT = WORLD_HEIGHT / 2
// Module-level shared GLTF cache so catalog models are fetched once per
// session instead of re-downloaded for every mounted renderer instance.
const sharedModelLoader = new GLTFLoader()
const sharedModelPromises = new Map()
const COLORS = Object.freeze({
  arena: 0x173c31,
  arenaEdge: 0x8ce8c1,
  token: 0x4aa8ff,
  target: 0xffd166,
  start: 0x43e5b0,
  obstacle: 0x7857c5,
  moving: 0xef476f,
  tracking: 0xff8c42,
  dynamic: 0xc75cff,
  switch: 0x43e5b0,
  field: 0x43a5ff,
  terrain: 0x3f7d5f,
  coin: 0xffd166,
  wall: 0xc98a4b,
  perimeterWall: 0xb07038,
  trail: 0x70f6ff,
  aim: 0xffd166,
})

/** @pure @param {number} x World x. @param {number} y World y. @param {number} [height=0] Height. @returns {Vector3} Scene position. */
function scenePoint(x, y, height = 0) {
  return new Vector3(x - HALF_WORLD_WIDTH, height, y - HALF_WORLD_HEIGHT)
}

/** @pure @param {object} item Configured shape. @returns {{width:number,height:number}} Collision footprint. */
function footprint(item) {
  return {
    width: item.width ?? item.size ?? 50,
    height: item.height ?? item.size ?? 50,
  }
}

/** @pure @param {object} item Entity configuration. @returns {number} Visual elevation in world units. */
function entityElevation(item) {
  return Number(item.elevation ?? item.z ?? 0) || 0
}

/** @pure @param {object} item Entity configuration. @returns {number} Visual extrusion in world units. */
function extrusion(item) {
  const size = footprint(item)
  return Number(item.visualHeight) || Math.max(22, Math.min(90, Math.min(size.width, size.height) * 0.7))
}

/**
 * Creates a BufferGeometry backed by a fixed-capacity position buffer so the
 * GPU buffer is uploaded in place every frame instead of re-allocating.
 *
 * @param {number} maxPoints Maximum number of line vertices.
 * @returns {BufferGeometry} Line geometry with a reusable position attribute.
 */
function createLineGeometry(maxPoints) {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(new Float32Array(maxPoints * 3), 3),
  )
  geometry.setDrawRange(0, 0)
  return geometry
}

/**
 * Writes trail points into a pooled line geometry in place.
 *
 * @param {BufferGeometry} geometry Pooled line geometry.
 * @param {object[]} points World-space sample points.
 * @param {number} baseHeight Vertical offset for the line layer.
 * @returns {void}
 */
function updateLineGeometry(geometry, points, baseHeight) {
  const position = geometry.attributes.position
  const count = Math.min(points.length, position.count)
  for (let index = 0; index < count; index += 1) {
    const point = points[index]
    position.setXYZ(
      index,
      point.x - HALF_WORLD_WIDTH,
      baseHeight + (point.z ?? 0),
      point.y - HALF_WORLD_HEIGHT,
    )
  }
  geometry.setDrawRange(0, count)
  position.needsUpdate = true
  geometry.computeBoundingSphere()
}

/** @param {object} object Three object. @param {number} opacity Opacity from 0 to 1. @returns {void} */
function setOpacity(object, opacity) {
  const targetOpacity = Math.max(0, Math.min(1, opacity))
  const transparent = targetOpacity < 1
  const materialList = []
  object.traverse((child) => {
    if (!child.material) return
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material]
    for (const material of materials) {
      if (!material || materialList.includes(material)) continue
      materialList.push(material)
      material.transparent = transparent
      material.opacity = targetOpacity
      material.depthWrite = !transparent
      material.needsUpdate = true
    }
  })
}

/** @param {object} root Object tree. @returns {void} */
function disposeObject(root) {
  root.traverse((item) => {
    item.geometry?.dispose?.()
    const materials = Array.isArray(item.material) ? item.material : [item.material]
    for (const material of materials) material?.dispose?.()
  })
}

/**
 * Creates a deterministic procedural mesh matching an engine collision footprint.
 *
 * @param {object} item Engine/render configuration.
 * @param {number} color Material color.
 * @param {string} role Presentation role.
 * @returns {Group|Mesh} Stable Three display object.
 */
function createEntityMesh(item, color, role = 'obstacle') {
  const dimensions = footprint(item)
  const verticalSize = extrusion(item)
  const material = new MeshStandardMaterial({
    color,
    roughness: 0.7,
    metalness: role === 'coin' ? 0.45 : 0.08,
    transparent: role === 'field',
    opacity: role === 'field' ? 0.28 : 1,
    side: DoubleSide,
  })
  let geometry
  if (role === 'token') {
    geometry = new SphereGeometry(dimensions.width / 2, 28, 18)
  } else if (role === 'target' || role === 'start') {
    geometry = new TorusGeometry(dimensions.width / 2, Math.max(4, dimensions.width * 0.09), 12, 48)
    geometry.rotateX(Math.PI / 2)
  } else if (role === 'coin') {
    geometry = new CylinderGeometry(dimensions.width / 2, dimensions.width / 2, item.visualHeight ?? 8, 24)
  } else if (item.shape === 'circle') {
    geometry = new CylinderGeometry(dimensions.width / 2, dimensions.width / 2, verticalSize, 32)
  } else {
    geometry = new BoxGeometry(dimensions.width, verticalSize, dimensions.height)
  }
  const mesh = new Mesh(geometry, material)
  if (role === 'token' && item.visualHeight) {
    mesh.scale.y = item.visualHeight / dimensions.width
  }
  if ((role === 'target' || role === 'start') && item.visualHeight) {
    const defaultThickness = Math.max(8, dimensions.width * 0.18)
    mesh.scale.y = item.visualHeight / defaultThickness
  }
  mesh.castShadow = role !== 'field' && role !== 'start' && role !== 'target'
  mesh.receiveShadow = true
  if (item.shape === 'diamond') mesh.rotation.y = Math.PI / 4
  if (item.visualRotationRadians !== undefined && item.shape !== 'diamond') {
    mesh.rotation.y = -item.visualRotationRadians
  }
  const baseHeight = role === 'token'
    ? (item.visualHeight ?? dimensions.width) / 2
    : role === 'target' || role === 'start'
      ? item.visualHeight
        ? item.visualHeight / 2
        : 4
      : role === 'coin'
        ? (item.visualHeight ?? 8) / 2
        : verticalSize / 2
  mesh.position.copy(scenePoint(item.x, item.y, entityElevation(item) + baseHeight))
  mesh.userData.baseDimensions = dimensions
  mesh.userData.baseVerticalSize = verticalSize
  mesh.userData.role = role
  mesh.userData.baseHeight = baseHeight
  mesh.userData.baseScale = mesh.scale.clone()
  return mesh
}

/**
 * Creates a terrain deck whose two top triangles exactly match TerrainSystem.
 * Corner elevations and thickness are measured in logical world units.
 *
 * @param {object} surface Authored terrain surface.
 * @returns {Mesh} Stable terrain mesh with a walkable top and visible skirt.
 */
export function createTerrainMesh(surface) {
  const halfWidth = surface.width / 2
  const halfHeight = surface.height / 2
  const thickness = surface.thickness ?? 8
  const corners = surface.cornerElevations
  const top = [
    [-halfWidth, corners.northWest, -halfHeight],
    [halfWidth, corners.northEast, -halfHeight],
    [halfWidth, corners.southEast, halfHeight],
    [-halfWidth, corners.southWest, halfHeight],
  ]
  const positions = [
    ...top,
    ...top.map(([x, height, z]) => [x, height - thickness, z]),
  ].flat()
  const indexedGeometry = new BufferGeometry()
  indexedGeometry.setAttribute(
    'position',
    new Float32BufferAttribute(positions, 3),
  )
  indexedGeometry.setIndex([
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
  ])
  const geometry = indexedGeometry.toNonIndexed()
  indexedGeometry.dispose()
  geometry.computeVertexNormals()
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({
      color: COLORS.terrain,
      roughness: 0.92,
      metalness: 0.02,
      side: DoubleSide,
    }),
  )
  mesh.position.copy(scenePoint(surface.x, surface.y, 0))
  mesh.name = surface.id
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.terrainSurface = true
  return mesh
}

/** @pure @param {object} arena Arena configuration. @returns {Vector3[]} Boundary points on the ground plane. */
function arenaBoundary(arena) {
  if (arena.shape === 'polygon') {
    return arena.points.map(([x, y]) => scenePoint(x, y, 2))
  }
  if (arena.shape === 'ellipse') {
    const points = []
    const rx = HALF_WORLD_WIDTH - arena.margin
    const rz = HALF_WORLD_HEIGHT - arena.margin
    for (let index = 0; index < 96; index += 1) {
      const angle = (index / 96) * Math.PI * 2
      points.push(new Vector3(Math.cos(angle) * rx, 2, Math.sin(angle) * rz))
    }
    return points
  }
  const margin = arena.margin ?? 0
  return [
    scenePoint(margin, margin, 2),
    scenePoint(WORLD_WIDTH - margin, margin, 2),
    scenePoint(WORLD_WIDTH - margin, WORLD_HEIGHT - margin, 2),
    scenePoint(margin, WORLD_HEIGHT - margin, 2),
  ]
}

/** @pure @param {object} arena Arena configuration. @returns {BufferGeometry} Flat arena geometry. */
function arenaGeometry(arena) {
  if (arena.shape === 'ellipse') {
    const geometry = new CircleGeometry(1, 96)
    geometry.scale(HALF_WORLD_WIDTH - arena.margin, HALF_WORLD_HEIGHT - arena.margin, 1)
    geometry.rotateX(-Math.PI / 2)
    return geometry
  }
  if (arena.shape === 'polygon') {
    const shape = new Shape()
    arena.points.forEach(([x, y], index) => {
      const sx = x - HALF_WORLD_WIDTH
      const sy = HALF_WORLD_HEIGHT - y
      if (index === 0) shape.moveTo(sx, sy)
      else shape.lineTo(sx, sy)
    })
    shape.closePath()
    const geometry = new ShapeGeometry(shape)
    geometry.rotateX(-Math.PI / 2)
    return geometry
  }
  return new PlaneGeometry(
    WORLD_WIDTH - (arena.margin ?? 0) * 2,
    WORLD_HEIGHT - (arena.margin ?? 0) * 2,
  ).rotateX(-Math.PI / 2)
}

/**
 * Owns the stable Three.js scene and projects engine x/y onto scene x/z.
 */
export class ThreeSceneRenderer {
  /** @param {object} options Three renderer, level, and display preferences. */
  constructor({
    app,
    level,
    development = false,
    reducedMotion = false,
    tokenCollisionTolerance = 0,
  }) {
    this.app = app
    this.level = level
    this.development = development
    this.reducedMotion = reducedMotion
    this.tokenCollisionTolerance = tokenCollisionTolerance
    this.scene = new Scene()
    this.scene.background = new Color(0x07131f)
    this.camera = new PerspectiveCamera(38, 16 / 9, 1, 6000)
    this.defaultCameraState = Object.freeze({
      azimuthDegrees: 0,
      elevationDegrees: 48.2,
      distance: 1770,
    })
    this.cameraState = { ...this.defaultCameraState }
    this.updateCameraTransform()
    this.raycaster = new Raycaster()
    this.groundPlane = new Plane(new Vector3(0, 1, 0), 0)
    this.entities = new Map()
    this.entityPresentations = new Map()
    this.terrainMeshes = []
    this.groundMesh = null
    this.bonusEntityIds = []
    this.debugGraphics = new Group()
    this.debugGraphics.visible = development
    this.trailLine = null
    this.trailLineGeometry = null
    this.aimGroup = new Group()
    this.ghostGroup = new Group()
    this.modelLoader = sharedModelLoader
    this.modelPromises = sharedModelPromises
    this.scene.add(this.debugGraphics, this.aimGroup, this.ghostGroup)
  }

  /** @returns {Promise<ThreeSceneRenderer>} Initialized renderer. */
  async build() {
    const ambient = new AmbientLight(0xb7d7ff, 1.8)
    const key = new DirectionalLight(0xffffff, 3.2)
    key.position.set(-500, 1100, 650)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.left = -1000
    key.shadow.camera.right = 1000
    key.shadow.camera.top = 800
    key.shadow.camera.bottom = -800
    this.scene.add(ambient, key)

    const ground = new Mesh(
      arenaGeometry(this.level.arena),
      new MeshStandardMaterial({ color: COLORS.arena, roughness: 0.92 }),
    )
    ground.receiveShadow = true
    this.scene.add(ground)
    this.groundMesh = ground
    for (const surface of this.level.terrainSurfaces ?? []) {
      const terrain = createTerrainMesh(surface)
      this.scene.add(terrain)
      this.terrainMeshes.push(terrain)
      this.entities.set(surface.id, terrain)
      this.entityPresentations.set(surface.id, {
        item: surface,
        role: 'terrain',
      })
    }
    const boundary = new LineLoop(
      new BufferGeometry().setFromPoints(arenaBoundary(this.level.arena)),
      new LineBasicMaterial({ color: COLORS.arenaEdge }),
    )
    this.scene.add(boundary)

    this.addEntity(this.level.mainTarget, COLORS.target, 'target')
    this.addEntity(
      {
        ...this.level.start,
        id: 'start',
        x: this.level.startPoint.x,
        y: this.level.startPoint.y,
        elevation: this.level.startPoint.elevation ?? 0,
        size: this.level.token.size,
      },
      COLORS.start,
      'start',
    )
    for (const bonus of this.level.bonusTargets) {
      const entity = this.addEntity(bonus, COLORS.target, 'target')
      entity.visible = false
      this.bonusEntityIds.push(bonus.id)
    }
    for (const item of this.level.obstacles) this.addEntity(item, COLORS.obstacle)
    for (const wall of this.level.walls ?? []) {
      this.addEntity(
        { ...wall, shape: wall.shape ?? 'rect' },
        wall.kind === 'perimeter' ? COLORS.perimeterWall : COLORS.wall,
        'wall',
      )
    }
    for (const item of this.level.movingObstacles) this.addEntity(item, COLORS.moving)
    for (const item of this.level.trackingObstacles) this.addEntity(item, COLORS.tracking)
    for (const item of this.level.dynamicObstacles ?? []) this.addEntity(item, COLORS.dynamic)
    for (const item of this.level.ramps ?? []) this.addEntity({ ...item, shape: 'rect' }, COLORS.start, 'ramp')
    for (const item of this.level.switches ?? []) this.addEntity(item, COLORS.switch, 'start')
    for (const item of this.level.forceFields ?? []) this.addEntity(item, COLORS.field, 'field')
    for (const item of this.level.coins) this.addEntity(item, COLORS.coin, 'coin')
    this.addEntity(
      {
        ...this.level.token,
        id: 'token',
        x: this.level.startPoint.x,
        y: this.level.startPoint.y,
        elevation: this.level.startPoint.elevation ?? this.level.token.elevation ?? 0,
      },
      COLORS.token,
      'token',
    )

    await this.addKenneyPresentation()
    this.resize()
    this.app.canvas.dataset.targetX = String(this.level.mainTarget.x)
    this.app.canvas.dataset.targetY = String(this.level.mainTarget.y)
    this.app.canvas.dataset.validatedPath = JSON.stringify(this.level.validatedPath ?? [])
    this.app.canvas.dataset.collisionTolerance = String(this.tokenCollisionTolerance)
    this.app.canvas.dataset.renderer = 'three-webgl'
    this.app.canvas.__pathProtocolWorldToScreen = (point) =>
      this.worldToScreen(point)
    return this
  }

  /** @param {object} item Entity configuration. @param {number} color Material color. @param {string} [role] Presentation role. @returns {Group|Mesh} Entity. */
  addEntity(item, color, role = 'obstacle') {
    const entity = createEntityMesh(item, color, role)
    entity.name = item.id ?? item.mediaId
    this.scene.add(entity)
    this.entities.set(entity.name, entity)
    this.entityPresentations.set(entity.name, { item, role })
    return entity
  }

  /**
   * Loads one registered GLB once and returns its cached source scene.
   *
   * @param {string} modelId Registered 3D model ID.
   * @returns {Promise<Group>} Cached source scene.
   */
  loadCatalogModel(modelId) {
    if (!this.modelPromises.has(modelId)) {
      const entry = getThreeModel(modelId)
      if (!entry) return Promise.reject(new Error(`Unknown 3D model ${modelId}`))
      this.modelPromises.set(
        modelId,
        this.modelLoader.loadAsync(threeAssetUrl(entry.src)).then((asset) => asset.scene),
      )
    }
    return this.modelPromises.get(modelId)
  }

  /** Adds manifest-selected CC0 Kenney models while collision remains JSON-owned. @returns {Promise<void>} */
  async addKenneyPresentation() {
    const assignments = [...this.entityPresentations.entries()]
      .map(([id, presentation]) => ({
        id,
        ...presentation,
        modelId:
          presentation.item.model3dId ??
          defaultModelForRole(presentation.role),
      }))
      .filter((assignment) => assignment.modelId)
    await Promise.all(
      assignments.map(async (assignment) => {
        try {
          const source = await this.loadCatalogModel(assignment.modelId)
          this.applyCatalogModel(assignment, source.clone(true))
        } catch {
          // Procedural geometry is the mandatory fallback for each failed model.
        }
      }),
    )
  }

  /**
   * Applies one loaded presentation model without changing JSON collision.
   * Terrain keeps its exact physics mesh and receives the selected model as
   * decoration; other entities replace their procedural fallback.
   *
   * @param {{id:string,item:object,role:string}} assignment Entity assignment.
   * @param {Group} model Detached catalog model scene.
   * @returns {void}
   */
  applyCatalogModel(assignment, model) {
    const { id, item, role } = assignment
    const footprintSize = Math.max(
      item.width ?? item.size ?? 50,
      item.height ?? item.size ?? 50,
    )
    const presentationSize =
      Number(item.model3dSize) ||
      (role === 'target' ? footprintSize * 1.8 : footprintSize)
    if (role === 'wall') {
      this.placeWallModel(model, item)
      model.rotation.y = -(item.visualRotationRadians ?? 0)
    } else {
      this.placeModel(model, item, presentationSize)
    }
    model.userData.baseScale = model.scale.clone()
    if (role === 'ramp') {
      model.rotation.y = -(item.directionDegrees * Math.PI) / 180
    }
    model.name = role === 'terrain' ? `${id}-model` : id
    model.userData.catalogModel = assignment.modelId
    model.traverse((child) => {
      child.castShadow = true
      child.receiveShadow = true
    })
    if (role !== 'terrain') {
      const previous = this.entities.get(id)
      if (previous) {
        model.visible = previous.visible
        this.scene.remove(previous)
        disposeObject(previous)
      }
      this.entities.set(id, model)
    }
    this.scene.add(model)
  }

  /** @param {Group} model Loaded model. @param {object} item World placement. @param {number} size Maximum model dimension in world units. @returns {void} */
  placeModel(model, item, size) {
    const box = new Box3().setFromObject(model)
    const dimensions = box.getSize(new Vector3())
    const maximum = Math.max(dimensions.x, dimensions.y, dimensions.z, 0.0001)
    model.scale.setScalar(size / maximum)
    let scaled = new Box3().setFromObject(model)
    if (item.visualHeight) {
      const scaledHeight = scaled.getSize(new Vector3()).y
      model.scale.y *= item.visualHeight / Math.max(scaledHeight, 0.0001)
      scaled = new Box3().setFromObject(model)
    }
    const center = scaled.getCenter(new Vector3())
    model.position.sub(center)
    const floor = scaled.min.y - center.y
    model.position.add(scenePoint(item.x, item.y, -floor + entityElevation(item)))
    model.userData.baseHeight = model.position.y - entityElevation(item)
  }

  /**
   * Fits a rectangular catalog model to an authored wall footprint.
   * Wall width, depth, and height are measured in logical world units.
   *
   * @param {Group} model Loaded wall model.
   * @param {object} item Authored wall configuration.
   * @returns {void}
   */
  placeWallModel(model, item) {
    const box = new Box3().setFromObject(model)
    const dimensions = box.getSize(new Vector3())
    const wallFootprint = footprint(item)
    model.scale.set(
      wallFootprint.width / Math.max(dimensions.x, 0.0001),
      extrusion(item) / Math.max(dimensions.y, 0.0001),
      wallFootprint.height / Math.max(dimensions.z, 0.0001),
    )
    const scaled = new Box3().setFromObject(model)
    const center = scaled.getCenter(new Vector3())
    model.position.sub(center)
    const floor = scaled.min.y - center.y
    model.position.add(scenePoint(item.x, item.y, -floor + entityElevation(item)))
    model.userData.baseHeight = model.position.y - entityElevation(item)
  }

  /** @param {number} [width] CSS width in pixels. @param {number} [height] CSS height in pixels. @returns {object} Viewport. */
  resize(width = this.app.canvas.clientWidth || 1, height = this.app.canvas.clientHeight || 1) {
    const safeWidth = Math.max(1, width)
    const safeHeight = Math.max(1, height)
    this.camera.aspect = safeWidth / safeHeight
    this.camera.updateProjectionMatrix()
    this.app.renderer.setSize(safeWidth, safeHeight, false)
    this.viewport = { width: safeWidth, height: safeHeight }
    return this.viewport
  }

  /** @param {{x:number,y:number}} point Canvas-relative CSS pixels. @returns {{x:number,y:number}} Engine world point. */
  screenToWorld(point) {
    this.setRayFromScreen(point)
    const renderedHits = this.raycaster.intersectObjects([
      ...this.terrainMeshes,
      this.groundMesh,
    ].filter(Boolean))
    const hit =
      renderedHits[0]?.point ??
      this.raycaster.ray.intersectPlane(this.groundPlane, new Vector3())
    if (!hit) return { x: HALF_WORLD_WIDTH, y: HALF_WORLD_HEIGHT }
    return {
      x: Math.max(0, Math.min(WORLD_WIDTH, hit.x + HALF_WORLD_WIDTH)),
      y: Math.max(0, Math.min(WORLD_HEIGHT, hit.z + HALF_WORLD_HEIGHT)),
    }
  }

  /** @param {{x:number,y:number}} point Canvas-relative CSS pixels. @returns {void} */
  setRayFromScreen(point) {
    const ndc = new Vector2(
      (point.x / this.viewport.width) * 2 - 1,
      1 - (point.y / this.viewport.height) * 2,
    )
    this.raycaster.setFromCamera(ndc, this.camera)
  }

  /**
   * Tests the visible 3D token rather than its ground-plane projection.
   *
   * @param {{x:number,y:number}} point Canvas-relative CSS pixels.
   * @returns {boolean} Whether the camera ray intersects the token model.
   */
  tokenHitTest(point) {
    const token = this.entities.get('token')
    if (!token) return false
    this.setRayFromScreen(point)
    return this.raycaster.intersectObject(token, true).length > 0
  }

  /** Applies the current camera orbit state without changing engine coordinates. @returns {void} */
  updateCameraTransform() {
    const azimuth = (this.cameraState.azimuthDegrees * Math.PI) / 180
    const elevation = (this.cameraState.elevationDegrees * Math.PI) / 180
    const horizontalDistance = Math.cos(elevation) * this.cameraState.distance
    this.camera.position.set(
      Math.sin(azimuth) * horizontalDistance,
      Math.sin(elevation) * this.cameraState.distance,
      Math.cos(azimuth) * horizontalDistance,
    )
    this.camera.lookAt(0, 0, 0)
    this.camera.updateMatrixWorld()
    if (this.app?.canvas) {
      this.app.canvas.dataset.cameraAzimuth = String(
        this.cameraState.azimuthDegrees,
      )
      this.app.canvas.dataset.cameraElevation = String(
        this.cameraState.elevationDegrees,
      )
    }
  }

  /**
   * Rotates or tilts the fixed-distance gameplay camera.
   *
   * @param {number} azimuthDelta Horizontal rotation in degrees.
   * @param {number} elevationDelta Vertical tilt in degrees.
   * @returns {{azimuthDegrees:number,elevationDegrees:number,distance:number}} Camera state.
   */
  adjustCamera(azimuthDelta = 0, elevationDelta = 0) {
    this.cameraState.azimuthDegrees =
      ((this.cameraState.azimuthDegrees + azimuthDelta + 180) % 360) - 180
    this.cameraState.elevationDegrees = Math.max(
      28,
      Math.min(72, this.cameraState.elevationDegrees + elevationDelta),
    )
    this.updateCameraTransform()
    this.app.renderer.render(this.scene, this.camera)
    return { ...this.cameraState }
  }

  /** Restores the documented default gameplay camera. @returns {object} Camera state. */
  resetCamera() {
    this.cameraState = { ...this.defaultCameraState }
    this.updateCameraTransform()
    this.app.renderer.render(this.scene, this.camera)
    return { ...this.cameraState }
  }

  /** @param {{x:number,y:number,elevation?:number}} point Engine world point. @returns {{x:number,y:number}} Canvas-relative CSS pixels. */
  worldToScreen(point) {
    const projected = scenePoint(
      point.x,
      point.y,
      point.elevation ?? 0,
    ).project(this.camera)
    const viewport = this.viewport ?? { width: 1, height: 1 }
    // Clamp homogeneous-w and cap out-of-view / behind-camera projections so
    // the result is always a finite, on-canvas coordinate.
    if (
      !Number.isFinite(projected.x) ||
      !Number.isFinite(projected.y) ||
      !Number.isFinite(projected.z)
    ) {
      return { x: viewport.width, y: viewport.height }
    }
    return {
      x: Math.max(0, Math.min(viewport.width, ((projected.x + 1) / 2) * viewport.width)),
      y: Math.max(0, Math.min(viewport.height, ((1 - projected.y) / 2) * viewport.height)),
    }
  }

  /** @param {object} entity Three entity. @param {number} x World x. @param {number} y World y. @returns {void} */
  setEntityPosition(entity, x, y) {
    if (!entity) return
    entity.position.x = x - HALF_WORLD_WIDTH
    entity.position.z = y - HALF_WORLD_HEIGHT
  }

  /** @param {object[]} points World trail points. @param {number} color Line color. @param {number} opacity Opacity. @returns {Line|null} Trail line. */
  createLine(points, color, opacity = 1) {
    if (points.length < 2) return null
    return new Line(
      new BufferGeometry().setFromPoints(points.map((point) => scenePoint(point.x, point.y, 7 + (point.z ?? 0)))),
      new LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
    )
  }

  /** @param {object} session Active engine session. @param {string} [phase] Machine phase. @returns {void} */
  update(session, phase = 'active-main') {
    const canvas = this.app.canvas
    canvas.dataset.tokenX = String(session.token.position.x)
    canvas.dataset.tokenY = String(session.token.position.y)
    canvas.dataset.tokenElevation = String(session.token.elevation ?? 0)
    canvas.dataset.phase = phase
    const tokenEntity = this.entities.get('token')
    this.setEntityPosition(tokenEntity, session.token.position.x, session.token.position.y)
    if (tokenEntity) {
      tokenEntity.position.y =
        (tokenEntity.userData.baseHeight ?? this.level.token.size / 2) +
        (session.token.elevation ?? 0)
    }
    for (const obstacle of session.movingObstacles) {
      this.setEntityPosition(this.entities.get(obstacle.id), obstacle.currentX, obstacle.currentY)
    }
    for (const obstacle of session.trackingObstacles) {
      this.setEntityPosition(this.entities.get(obstacle.id), obstacle.x, obstacle.y)
    }
    for (const obstacle of session.dynamicObstacles ?? []) {
      const entity = this.entities.get(obstacle.id)
      const configured = (this.level.dynamicObstacles ?? []).find(
        (item) => item.id === obstacle.id,
      )
      if (!entity || !configured) continue
      this.setEntityPosition(entity, obstacle.x, obstacle.y)
      const baseScale = entity.userData?.baseScale
      const baseX = baseScale?.x ?? 1
      const baseZ = baseScale?.z ?? 1
      const widthRatio = obstacle.width / (configured.width || obstacle.width)
      const heightRatio = obstacle.height / (configured.height || obstacle.height)
      entity.scale.x = baseX * widthRatio
      entity.scale.z = baseZ * heightRatio
      entity.rotation.y = -(obstacle.rotationRadians ?? 0)
      setOpacity(entity, obstacle.state === 'open' ? 0.18 : obstacle.state === 'warning' ? 0.55 : 1)
    }
    for (const coin of this.level.coins) {
      const entity = this.entities.get(coin.id)
      if (entity) entity.visible = !session.collectedCoinIds.has(coin.id)
    }
    for (const item of this.level.switches ?? []) {
      const entity = this.entities.get(item.id)
      const active = isSwitchActive(session.switchStates?.get(item.id), session.hazardTimeMs)
      if (entity) setOpacity(entity, active ? 1 : 0.55)
    }
    for (let index = 0; index < this.bonusEntityIds.length; index += 1) {
      const entity = this.entities.get(this.bonusEntityIds[index])
      if (entity) {
        entity.visible = index === session.targets?.activeBonusIndex && ['bonus-offer', 'bonus-ready', 'active-bonus'].includes(phase)
      }
    }

    const activeTrail = session.trails.active
    if (this.trailLine) {
      if (
        activeTrail.length >= 2 &&
        activeTrail.length <= this.trailLineGeometry.attributes.position.count
      ) {
        updateLineGeometry(this.trailLineGeometry, activeTrail, 7)
      } else {
        // Trail has been reset or needs a larger pooled buffer.
        this.scene.remove(this.trailLine)
        disposeObject(this.trailLine)
        this.trailLine = null
        this.trailLineGeometry = null
        if (activeTrail.length >= 2) {
          this.trailLineGeometry = createLineGeometry(activeTrail.length)
          updateLineGeometry(this.trailLineGeometry, activeTrail, 7)
          this.trailLine = new Line(
            this.trailLineGeometry,
            new LineBasicMaterial({ color: COLORS.trail }),
          )
          this.scene.add(this.trailLine)
        }
      }
    } else if (activeTrail.length >= 2) {
      this.trailLineGeometry = createLineGeometry(activeTrail.length)
      updateLineGeometry(this.trailLineGeometry, activeTrail, 7)
      this.trailLine = new Line(
        this.trailLineGeometry,
        new LineBasicMaterial({ color: COLORS.trail }),
      )
      this.scene.add(this.trailLine)
    }

    while (this.aimGroup.children.length) {
      const child = this.aimGroup.children.pop()
      disposeObject(child)
    }
    const aimVector = session.kinetic
      ? session.input.mode === 'pointer' && (session.level.shotMechanic.inputStyle ?? 'drag-release') === 'drag-release'
        ? { x: session.kinetic.aimStart.x - session.input.desiredPosition.x, y: session.kinetic.aimStart.y - session.input.desiredPosition.y }
        : { x: session.input.desiredPosition.x - session.token.position.x, y: session.input.desiredPosition.y - session.token.position.y }
      : null
    if (session.kinetic?.phase === 'aiming' && aimVector) {
      const end = { x: session.token.position.x + aimVector.x, y: session.token.position.y + aimVector.y }
      const line = this.createLine([session.token.position, end], COLORS.aim)
      if (line) this.aimGroup.add(line)
    }

    canvas.dataset.movingPositions = JSON.stringify(session.movingObstacles.map((item) => [item.id, item.currentX, item.currentY]))
    canvas.dataset.trackingPositions = JSON.stringify(session.trackingObstacles.map((item) => [item.id, item.x, item.y]))
    canvas.dataset.dynamicStates = JSON.stringify(
      (session.dynamicObstacles ?? []).map((item) => [
        item.id,
        item.state,
        item.x,
        item.y,
        item.width,
        item.height,
      ]),
    )
    canvas.dataset.kineticPhase = session.kinetic?.phase ?? ''
    canvas.dataset.shotsTaken = String(session.kinetic?.shotsTaken ?? 0)
    canvas.dataset.shotPower = String(
      aimVector
        ? Math.min(
            1,
            Math.hypot(aimVector.x, aimVector.y) /
              session.level.shotMechanic.aimDistanceForMaximumSpeed,
          )
        : 0,
    )
    canvas.dataset.shotsRemaining = String(
      session.level?.shotGoals?.maximumShots === undefined
        ? ''
        : Math.max(
            0,
            session.level.shotGoals.maximumShots -
              (session.kinetic?.shotsTaken ?? 0),
          ),
    )
    canvas.dataset.trailSamples = String(session.trails.active.length)
    canvas.dataset.ghostCount = String(
      this.reducedMotion ? 0 : (session.trails.ghosts?.length ?? 0),
    )
    canvas.dataset.activePowers = [...(session.activePowers?.keys() ?? [])].join(',')
    canvas.dataset.routeScanVisible = String(Boolean(session.routeScanPath?.length))
    this.app.renderer.render(this.scene, this.camera)
  }

  /** Releases scene geometry, materials, and object references. */
  destroy() {
    delete this.app.canvas.__pathProtocolWorldToScreen
    disposeObject(this.scene)
    this.scene.clear()
    this.entities.clear()
    this.entityPresentations.clear()
    // Shared catalog sources are intentionally retained for the next mount;
    // destroying this instance only disposes the clones in this.scene.
  }
}
