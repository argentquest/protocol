import { Graphics } from 'pixi.js'
import { insetShape } from '../../geometry/geometry.js'
import { createArenaMask } from './ArenaMask.js'
import { createMediaEntity } from './EntityFactory.js'
import { createSceneLayers } from './SceneLayers.js'
import { calculateViewport } from './Viewport.js'
import { isSwitchActive } from '../../engine/SwitchSystem.js'
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../world.js'

function mediaDefinition(cacheDefinitions, mediaId) {
  return (
    cacheDefinitions.get(mediaId) ?? {
      category: 'obstacles',
      renderMode: 'vector',
      sizing: 'stretch',
    }
  )
}

function drawTrail(graphics, points, color, width, alpha = 1) {
  graphics.clear()
  if (points.length < 2) return
  graphics.moveTo(points[0].x, points[0].y)
  for (const point of points.slice(1)) graphics.lineTo(point.x, point.y)
  graphics.stroke({ color, width, alpha, cap: 'round', join: 'round' })
}

/**
 * Draws the token's authoritative collision edge in logical world units.
 *
 * @param {Graphics} graphics Pixi graphics used only for the collision guide.
 * @param {object} token Visible token geometry.
 * @param {{x: number, y: number}} position Token center in world units.
 * @param {number} toleranceUnits Collision inset in world units.
 * @param {{color: number, width: number}} style Theme presentation values.
 */
function drawCollisionGuide(
  graphics,
  token,
  position,
  toleranceUnits,
  style,
) {
  graphics.clear()
  const shape = insetShape({ ...token, ...position }, toleranceUnits)
  const halfWidth = shape.width / 2
  const halfHeight = shape.height / 2
  if (shape.shape === 'circle') {
    graphics.circle(shape.x, shape.y, halfWidth)
  } else if (shape.shape === 'diamond') {
    graphics
      .moveTo(shape.x, shape.y - halfHeight)
      .lineTo(shape.x + halfWidth, shape.y)
      .lineTo(shape.x, shape.y + halfHeight)
      .lineTo(shape.x - halfWidth, shape.y)
      .closePath()
  } else {
    graphics.rect(
      shape.x - halfWidth,
      shape.y - halfHeight,
      shape.width,
      shape.height,
    )
  }
  graphics.stroke({
    color: style.color,
    width: style.width,
    alpha: 0.9,
  })
}

/**
 * Owns stable Pixi display objects and applies engine state imperatively.
 */
export class PixiSceneRenderer {
  /**
   * Creates stable Pixi scene objects for one generated level.
   *
   * @param {object} options Renderer dependencies and debug settings.
   */
  constructor({
    app,
    level,
    manifest,
    assetCache,
    development = false,
    reducedMotion = false,
    tokenCollisionTolerance = 0,
    collisionGuideStyle = {},
    classes = {},
  }) {
    this.app = app
    this.level = level
    this.manifest = manifest
    this.assetCache = assetCache
    this.development = development
    this.reducedMotion = reducedMotion
    this.tokenCollisionTolerance = tokenCollisionTolerance
    this.collisionGuideStyle = {
      color: collisionGuideStyle.color ?? 0xffffff,
      width: collisionGuideStyle.width ?? 1.5,
    }
    this.GraphicsClass = classes.GraphicsClass ?? Graphics
    this.SpriteClass = classes.SpriteClass
    const scene = createSceneLayers(classes.ContainerClass)
    this.root = scene.root
    this.layers = scene.layers
    this.entities = new Map()
    this.bonusEntityIds = []
    this.ghostGraphics = []
    this.media = new Map(manifest.visuals.map((item) => [item.mediaId, item]))
    this.mask = createArenaMask(level.arena, this.GraphicsClass)
    this.root.mask = this.mask
    app.stage.addChild(this.mask, this.root)
  }

  /**
   * Adds one cached vector or texture entity to a named scene layer.
   *
   * @param {string} layerName Stable scene-layer name.
   * @param {object} item Entity in logical world units.
   * @param {string} [mediaId=item.mediaId] Theme-neutral media ID.
   * @returns {Promise<object>} Created Pixi display object.
   */
  async addEntity(layerName, item, mediaId = item.mediaId) {
    const resource = await this.assetCache.get(mediaId)
    const entity = createMediaEntity({
      resource,
      definition: mediaDefinition(this.media, mediaId),
      item: { ...item, mediaId },
      GraphicsClass: this.GraphicsClass,
      ...(this.SpriteClass ? { SpriteClass: this.SpriteClass } : {}),
    })
    entity.baseScale = { x: entity.scale.x, y: entity.scale.y }
    this.layers[layerName].addChild(entity)
    this.entities.set(item.id ?? mediaId, entity)
    return entity
  }

  /**
   * Builds all stable arena, hazard, target, coin, effect, and token objects.
   *
   * @returns {Promise<PixiSceneRenderer>} This initialized renderer.
   */
  async build() {
    await this.addEntity('arena', {
      id: 'arena',
      mediaId: this.level.arena.mediaId,
      x: WORLD_WIDTH / 2,
      y: WORLD_HEIGHT / 2,
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
    })
    await this.addEntity('targets', this.level.mainTarget)
    for (const bonus of this.level.bonusTargets) {
      const entity = await this.addEntity('targets', bonus)
      entity.visible = false
      this.bonusEntityIds.push(bonus.id)
    }
    await Promise.all([
      ...this.level.obstacles.map((item) => this.addEntity('obstacles', item)),
      ...this.level.movingObstacles.map((item) => this.addEntity('obstacles', item)),
      ...this.level.trackingObstacles.map((item) => this.addEntity('obstacles', item)),
      ...(this.level.dynamicObstacles ?? []).map((item) =>
        this.addEntity('obstacles', item),
      ),
      ...(this.level.switches ?? []).map((item) =>
        this.addEntity('targets', item),
      ),
      ...(this.level.forceFields ?? []).map((item) =>
        this.addEntity('effects', item),
      ),
      ...this.level.coins.map((item) => this.addEntity('coins', item)),
    ])
    await this.addEntity('token', {
      ...this.level.token,
      id: 'token',
      x: this.level.startPoint.x,
      y: this.level.startPoint.y,
    })
    this.activeTrail = new this.GraphicsClass()
    this.layers.trail.addChild(this.activeTrail)
    this.effectGraphics = new this.GraphicsClass()
    this.layers.effects.addChild(this.effectGraphics)
    this.debugGraphics = new this.GraphicsClass()
    this.debugGraphics.visible = this.development
    this.layers.debug.addChild(this.debugGraphics)
    this.collisionGuideGraphics = new this.GraphicsClass()
    this.layers.collisionGuide.addChild(this.collisionGuideGraphics)
    this.resize()
    this.app.canvas.dataset.engineReady = 'true'
    this.app.canvas.dataset.targetX = String(this.level.mainTarget.x)
    this.app.canvas.dataset.targetY = String(this.level.mainTarget.y)
    this.app.canvas.dataset.validatedPath = JSON.stringify(
      this.level.validatedPath ?? [],
    )
    this.app.canvas.dataset.collisionTolerance = String(
      this.tokenCollisionTolerance,
    )
    return this
  }

  /**
   * Applies uniform centered viewport scaling.
   *
   * @param {number} [width] Canvas width in CSS pixels.
   * @param {number} [height] Canvas height in CSS pixels.
   * @returns {void}
   */
  resize(width = this.app.renderer.width, height = this.app.renderer.height) {
    this.viewport = calculateViewport(width, height)
    this.root.position.set(this.viewport.offsetX, this.viewport.offsetY)
    this.root.scale.set(this.viewport.scale)
    this.mask.position.set(this.viewport.offsetX, this.viewport.offsetY)
    this.mask.scale.set(this.viewport.scale)
    return this.viewport
  }

  /**
   * Updates stable display transforms from current engine session state.
   *
   * @param {object} session Active engine session.
   * @param {string} [phase='active-main'] State-machine phase.
   * @returns {void}
   */
  update(session, phase = 'active-main') {
    this.app.canvas.dataset.tokenX = String(session.token.position.x)
    this.app.canvas.dataset.tokenY = String(session.token.position.y)
    this.app.canvas.dataset.phase = phase
    const token = this.entities.get('token')
    token?.position.set(session.token.position.x, session.token.position.y)
    drawCollisionGuide(
      this.collisionGuideGraphics,
      this.level.token,
      session.token.position,
      this.tokenCollisionTolerance,
      this.collisionGuideStyle,
    )
    for (const obstacle of session.movingObstacles) {
      this.entities.get(obstacle.id)?.position.set(
        obstacle.currentX,
        obstacle.currentY,
      )
    }
    for (const obstacle of session.trackingObstacles) {
      this.entities.get(obstacle.id)?.position.set(obstacle.x, obstacle.y)
    }
    for (const obstacle of session.dynamicObstacles ?? []) {
      const entity = this.entities.get(obstacle.id)
      if (!entity) continue
      const configured = this.level.dynamicObstacles.find(
        (item) => item.id === obstacle.id,
      )
      entity.position.set(obstacle.x, obstacle.y)
      entity.rotation = obstacle.rotationRadians ?? 0
      entity.scale.set(
        entity.baseScale.x * (obstacle.width / configured.width),
        entity.baseScale.y * (obstacle.height / configured.height),
      )
      entity.alpha =
        obstacle.state === 'open'
          ? 0.18
          : obstacle.state === 'warning'
            ? 0.55
            : 1
    }
    this.app.canvas.dataset.movingPositions = JSON.stringify(
      session.movingObstacles.map((item) => [item.id, item.currentX, item.currentY]),
    )
    this.app.canvas.dataset.trackingPositions = JSON.stringify(
      session.trackingObstacles.map((item) => [item.id, item.x, item.y]),
    )
    this.app.canvas.dataset.dynamicStates = JSON.stringify(
      (session.dynamicObstacles ?? []).map((item) => [
        item.id,
        item.state,
        item.x,
        item.y,
        item.width,
        item.height,
      ]),
    )
    for (const coin of this.level.coins) {
      const entity = this.entities.get(coin.id)
      if (entity) entity.visible = !session.collectedCoinIds.has(coin.id)
    }
    for (const item of this.level.switches ?? []) {
      const entity = this.entities.get(item.id)
      const active = isSwitchActive(
        session.switchStates?.get(item.id),
        session.hazardTimeMs,
      )
      if (entity) entity.alpha = active ? 1 : 0.55
    }
    for (let index = 0; index < this.bonusEntityIds.length; index += 1) {
      const entity = this.entities.get(this.bonusEntityIds[index])
      if (entity) {
        entity.visible =
          index === session.targets?.activeBonusIndex &&
          ['bonus-offer', 'bonus-ready', 'active-bonus'].includes(phase)
      }
    }
    drawTrail(this.activeTrail, session.trails.active, 0x70f6ff, 5)
    const ghosts = this.reducedMotion ? [] : (session.trails.ghosts ?? [])
    while (this.ghostGraphics.length < ghosts.length) {
      const graphics = new this.GraphicsClass()
      this.ghostGraphics.push(graphics)
      this.layers.ghostTrail.addChild(graphics)
    }
    for (let index = 0; index < this.ghostGraphics.length; index += 1) {
      const graphics = this.ghostGraphics[index]
      graphics.visible = index < ghosts.length
      if (graphics.visible) {
        drawTrail(graphics, ghosts[index], 0x70f6ff, 3, 0.18)
      }
    }
    this.effectGraphics.clear()
    const activeEffects = new Set(session.activePowers?.keys() ?? [])
    this.app.canvas.dataset.activePowers = [...activeEffects].join(',')
    this.app.canvas.dataset.ghostCount = String(ghosts.length)
    this.app.canvas.dataset.trailSamples = String(session.trails.active.length)
    this.app.canvas.dataset.routeScanVisible = String(
      Boolean(session.routeScanPath?.length),
    )
    if (activeEffects.has('obstacleShield') || activeEffects.has('fullShield')) {
      const radius = Math.max(this.level.token.width, this.level.token.height) / 2 + 12
      this.effectGraphics
        .circle(session.token.position.x, session.token.position.y, radius)
        .stroke({
          color: activeEffects.has('fullShield') ? 0xff55dd : 0x70f6ff,
          width: 5,
          alpha: 0.85,
        })
    }
    if (this.development) this.drawDiagnostics(session)
    this.app.renderer.render(this.app.stage)
  }

  /**
   * Draws development-only collision shapes and tracking zones.
   *
   * @param {object} session Active engine session.
   * @returns {void}
   */
  drawDiagnostics(session) {
    const graphics = this.debugGraphics
    graphics.clear()
    for (const obstacle of this.level.trackingObstacles) {
      graphics
        .rect(
          obstacle.zone.x,
          obstacle.zone.y,
          obstacle.zone.width,
          obstacle.zone.height,
        )
        .stroke({ color: 0xff55dd, width: 2, alpha: 0.45 })
    }
    if (session.routeScanPath?.length > 1) {
      graphics.moveTo(session.routeScanPath[0].x, session.routeScanPath[0].y)
      for (const point of session.routeScanPath.slice(1)) {
        graphics.lineTo(point.x, point.y)
      }
      graphics.stroke({ color: 0x43e5b0, width: 4, alpha: 0.7 })
    }
    for (const obstacle of session.trackingObstacles) {
      graphics
        .moveTo(obstacle.x, obstacle.y)
        .lineTo(
          obstacle.x + obstacle.velocityX * 0.5,
          obstacle.y + obstacle.velocityY * 0.5,
        )
        .stroke({ color: 0xffb224, width: 2, alpha: 0.8 })
    }
  }

  /** Releases scene graph references owned by this renderer. */
  destroy() {
    this.entities.clear()
    this.root.destroy({ children: true })
    this.mask.destroy()
  }
}
