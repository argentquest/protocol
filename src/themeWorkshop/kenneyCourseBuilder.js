import courseTemplateConfig from '../config/kenneyCourseTemplates.json'

/** @typedef {{group:string,index:number|null}} EditorSelection */

/** Immutable course-builder templates loaded from validated configuration. */
export const kenneyCourseTemplates = Object.freeze(
  courseTemplateConfig.templates.map((template) => Object.freeze(template)),
)

/**
 * Finds one course-builder template by stable ID.
 *
 * @pure
 * @param {string} templateId Stable authoring-template ID.
 * @returns {object|null} Matching template or `null`.
 */
export function getKenneyCourseTemplate(templateId) {
  return (
    kenneyCourseTemplates.find((template) => template.id === templateId) ?? null
  )
}

/**
 * Appends one item to a level entity group.
 *
 * @pure
 * @param {object} level Editable level JSON.
 * @param {string} group Level array property.
 * @param {object} entity Schema-ready entity.
 * @returns {object} Updated level JSON.
 */
function append(level, group, entity) {
  return {
    ...level,
    [group]: [...(level[group] ?? []), entity],
  }
}

/**
 * Expands a Kenney authoring template into ordinary schema-backed level
 * entities. Model visuals never define collision: lane walls, ramp launch
 * regions, and obstacle footprints are all written into the level JSON.
 *
 * @pure
 * @param {object} level Editable level JSON.
 * @param {string} templateId Stable template ID.
 * @param {{x?:number,y?:number,sequence?:string}} [options] Placement center in world units.
 * @returns {{level:object,selection:EditorSelection}|null} Updated level and primary selection.
 */
export function placeKenneyCourseTemplate(
  level,
  templateId,
  { x = 800, y = 450, sequence = Date.now().toString(36) } = {},
) {
  const template = getKenneyCourseTemplate(templateId)
  if (!template) return null
  const prefix = `kenney-${template.id}-${sequence}`
  const common = {
    x,
    y,
    width: template.width,
    height: template.height,
    model3dId: template.model3dId,
    model3dFit: 'footprint',
    visualHeight: template.visualHeight,
  }

  if (template.kind === 'lane') {
    const surface = {
      id: `${prefix}-surface`,
      mediaId: 'obstacle-static-rect',
      ...common,
      cornerElevations: {
        northWest: 0,
        northEast: 0,
        southEast: 0,
        southWest: 0,
      },
      friction: 180,
      thickness: 10,
    }
    let next = append(level, 'terrainSurfaces', surface)
    const thickness = template.wallThickness ?? 0
    if (thickness > 0) {
      const wallBase = {
        mediaId: 'obstacle-static-rect',
        shape: 'rect',
        x,
        width: template.width,
        height: thickness,
        visualHeight: Math.max(30, thickness * 1.8),
        collisionHeight: Math.max(30, thickness * 1.8),
        orientation: 0,
        kind: 'interior',
        restitution: 0.85,
      }
      next = append(next, 'walls', {
        ...wallBase,
        id: `${prefix}-north-wall`,
        y: y - template.height / 2 + thickness / 2,
      })
      next = append(next, 'walls', {
        ...wallBase,
        id: `${prefix}-south-wall`,
        y: y + template.height / 2 - thickness / 2,
      })
    }
    if (!next.verticalPhysics) {
      next = {
        ...next,
        verticalPhysics: {
          gravity: 900,
          maximumFallSpeed: 1400,
          groundHeight: 0,
          maximumStepHeight: 12,
        },
      }
    }
    return {
      level: next,
      selection: {
        group: 'terrainSurfaces',
        index: next.terrainSurfaces.length - 1,
      },
    }
  }

  if (template.kind === 'ramp') {
    const entity = {
      id: `${prefix}-ramp`,
      mediaId: 'obstacle-static-rect',
      ...common,
      directionDegrees: 0,
      launchVelocity: 480,
      minimumApproachSpeed: 150,
    }
    let next = append(level, 'ramps', entity)
    if (!next.verticalPhysics) {
      next = {
        ...next,
        verticalPhysics: {
          gravity: 900,
          maximumFallSpeed: 1400,
          groundHeight: 0,
          maximumStepHeight: 12,
        },
      }
    }
    return {
      level: next,
      selection: { group: 'ramps', index: next.ramps.length - 1 },
    }
  }

  const entity = {
    id: `${prefix}-obstacle`,
    mediaId: 'obstacle-static-rect',
    shape: 'rect',
    ...common,
  }
  const next = append(level, 'manualObstacles', entity)
  return {
    level: next,
    selection: {
      group: 'manualObstacles',
      index: next.manualObstacles.length - 1,
    },
  }
}

/**
 * Replaces a duplicated campaign level with a deterministic Kenney builder
 * showcase while preserving the server-issued immutable identity.
 *
 * @pure
 * @param {object} source Server-created duplicated level.
 * @returns {object} Schema-ready demonstration level.
 */
export function createKenneyDemoLevel(source) {
  let level = {
    ...structuredClone(source),
    name: 'Kenney Builder Showcase',
    briefing:
      'A template-built fairway demonstrating fitted GLB presentation and JSON-owned walls and hazards.',
    seed: 'kenney-builder-showcase-v1',
    arena: {
      shape: 'rect',
      mediaId: 'arena-standard',
      margin: 40,
      cornerRadius: 30,
    },
    token: {
      ...source.token,
      model3dId: 'kenney-minigolf-ball-blue',
    },
    start: {
      mode: 'manual',
      mediaId: 'start-pad',
      model3dId: 'kenney-minigolf-ball-green',
      x: 170,
      y: 450,
    },
    mainTarget: {
      mode: 'manual',
      mediaId: 'target-main',
      model3dId: 'kenney-minigolf-flag-blue',
      model3dSize: 100,
      x: 1430,
      y: 450,
      size: 70,
    },
    generation: {
      ...source.generation,
      obstacleCount: 0,
    },
    manualObstacles: [],
    movingObstacles: [],
    trackingObstacles: [],
    dynamicObstacles: [],
    terrainSurfaces: [],
    ramps: [],
    walls: [],
    switches: [],
    forceFields: [],
    coins: [
      {
        id: 'kenney-demo-coin',
        mediaId: 'coin-standard',
        x: 800,
        y: 360,
        size: 30,
        value: 1,
      },
    ],
    bonuses: {
      ...source.bonuses,
      targets: [],
      maximumTargets: 0,
    },
  }
  delete level.shotGoals
  const lane = placeKenneyCourseTemplate(level, 'straight-fairway', {
    x: 800,
    y: 450,
    sequence: 'demo-lane',
  })
  level = lane.level
  level.terrainSurfaces[0] = {
    ...level.terrainSurfaces[0],
    width: 1320,
    height: 360,
  }
  level.walls = level.walls.map((wall) => ({
    ...wall,
    width: 1320,
    y: wall.id.includes('north') ? 280 : 620,
  }))
  level = placeKenneyCourseTemplate(level, 'windmill-hazard', {
    x: 790,
    y: 450,
    sequence: 'demo-windmill',
  }).level
  level = placeKenneyCourseTemplate(level, 'diamond-rebound', {
    x: 1090,
    y: 525,
    sequence: 'demo-diamond',
  }).level
  return level
}
