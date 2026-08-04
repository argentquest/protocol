import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameView from '../game/GameView.jsx'
import { mediaDefinitions, soundDefinitions } from '../config/loadConfig.js'
import { generateLevel } from '../game/generation/levelGenerator.js'
import { authApi, mediaLibraryApi, themeApi } from './themeApi.js'
import {
  addArenaPoint,
  convertArenaShape,
  entitySize,
  isResizableEntity,
  moveArenaPoint,
  removeArenaPoint,
  resizeEntity,
  snapToEditorGrid as snap,
} from './levelEditorGeometry.js'

const ENTITY_GROUPS = [
  'manualObstacles',
  'movingObstacles',
  'trackingObstacles',
  'dynamicObstacles',
  'switches',
  'forceFields',
  'coins',
]

const RESIZE_HANDLES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

const OBSTACLE_GUIDE = [
  {
    name: 'Static obstacle',
    implementation: 'Fixed collision shape; it never moves or changes state.',
  },
  {
    name: 'Axis sweeper',
    implementation: 'Moves sinusoidally on its configured X or Y axis using amplitude, period, and phase.',
  },
  {
    name: 'Tracking obstacle',
    implementation: 'Chases the token after the attempt starts, accelerating and turning gradually inside its rectangular zone.',
  },
  {
    name: 'Phase gate',
    implementation: 'Cycles through solid, open, and warning states; only the solid interval collides.',
  },
  {
    name: 'Pulse block',
    implementation: 'Continuously scales its real collision width and height between configured minimum and maximum values.',
  },
  {
    name: 'Orbiter',
    implementation: 'Moves around its authored center on an elliptical orbit and remains solid throughout the cycle.',
  },
  {
    name: 'Spinner',
    implementation: 'Rotates its rectangular collision geometry at a configured number of degrees per second.',
  },
  {
    name: 'Switch barrier',
    implementation: 'Changes between solid and open from a referenced switch; the template starts solid and opens while that switch is active.',
  },
]

/**
 * Flattens editable level groups into stable editor selections.
 *
 * @pure
 * @param {object} level Editable level configuration.
 * @returns {Array<{group:string,index:number|null,entity:object,label:string}>} Entity descriptors.
 */
function entityDescriptors(level) {
  const descriptors = [
    { group: 'start', index: null, entity: level.start, label: 'Start' },
    {
      group: 'mainTarget',
      index: null,
      entity: level.mainTarget,
      label: 'Target',
    },
  ]
  for (const group of ENTITY_GROUPS) {
    for (const [index, entity] of (level[group] ?? []).entries()) {
      descriptors.push({
        group,
        index,
        entity,
        label: entity.id ?? `${group} ${index + 1}`,
      })
    }
  }
  for (const [index, entity] of (level.bonuses?.targets ?? []).entries()) {
    descriptors.push({
      group: 'bonusTargets',
      index,
      entity,
      label: entity.id ?? `Bonus ${index + 1}`,
    })
  }
  return descriptors
}

/**
 * Resolves the currently selected entity from its group and index.
 *
 * @pure
 * @param {object} level Editable level configuration.
 * @param {{group:string,index:number|null}|null} selection Editor selection.
 * @returns {object|null} Selected entity.
 */
function getEntity(level, selection) {
  if (!selection) return null
  if (selection.group === 'start' || selection.group === 'mainTarget') {
    return level[selection.group]
  }
  if (selection.group === 'bonusTargets') {
    return level.bonuses.targets[selection.index]
  }
  return level[selection.group]?.[selection.index] ?? null
}

/**
 * Immutably replaces one selected entity in a level document.
 *
 * @pure
 * @param {object} level Editable level configuration.
 * @param {{group:string,index:number|null}} selection Editor selection.
 * @param {object} entity Updated entity.
 * @returns {object} Updated level document.
 */
function replaceEntity(level, selection, entity) {
  if (selection.group === 'start' || selection.group === 'mainTarget') {
    return { ...level, [selection.group]: entity }
  }
  if (selection.group === 'bonusTargets') {
    const targets = [...level.bonuses.targets]
    targets[selection.index] = entity
    return { ...level, bonuses: { ...level.bonuses, targets } }
  }
  const entities = [...level[selection.group]]
  entities[selection.index] = entity
  return { ...level, [selection.group]: entities }
}

/**
 * Immutably removes an optional selected entity and repairs bonus limits.
 *
 * @pure
 * @param {object} level Editable level configuration.
 * @param {{group:string,index:number|null}|null} selection Editor selection.
 * @returns {object} Updated or unchanged level document.
 */
function removeEntity(level, selection) {
  if (
    !selection ||
    selection.group === 'start' ||
    selection.group === 'mainTarget'
  ) {
    return level
  }
  if (selection.group === 'bonusTargets') {
    const targets = level.bonuses.targets.filter(
      (_entity, index) => index !== selection.index,
    )
    return {
      ...level,
      bonuses: {
        ...level.bonuses,
        targets,
        maximumTargets: Math.min(level.bonuses.maximumTargets, targets.length),
      },
    }
  }
  return {
    ...level,
    [selection.group]: level[selection.group].filter(
      (_entity, index) => index !== selection.index,
    ),
  }
}

/**
 * Adds a centered, schema-ready entity template of the requested mechanic.
 *
 * @param {object} level Editable level configuration.
 * @param {string} type Workshop entity-template type.
 * @returns {{level:object,selection:object}} Updated level and new selection.
 */
function addEntity(level, type) {
  const sequence = Date.now().toString(36)
  const common = { x: 800, y: 450 }
  const templates = {
    static: {
      group: 'manualObstacles',
      entity: {
        id: `barrier-${sequence}`,
        mediaId: 'obstacle-static-rect',
        shape: 'rect',
        ...common,
        width: 100,
        height: 60,
      },
    },
    moving: {
      group: 'movingObstacles',
      entity: {
        id: `sweeper-${sequence}`,
        mediaId: 'obstacle-moving-circle',
        shape: 'circle',
        ...common,
        size: 44,
        axis: 'x',
        amplitude: 100,
        periodMs: 4000,
        phase: 0,
      },
    },
    tracking: {
      group: 'trackingObstacles',
      entity: {
        id: `tracker-${sequence}`,
        mediaId: 'obstacle-tracking-circle',
        shape: 'circle',
        ...common,
        width: 38,
        height: 38,
        zone: { x: 680, y: 330, width: 240, height: 240 },
        maxSpeed: 115,
        acceleration: 180,
        turnRateDegreesPerSecond: 120,
      },
    },
    phase: {
      group: 'dynamicObstacles',
      entity: {
        id: `phase-${sequence}`,
        mediaId: 'obstacle-phase-gate',
        shape: 'rect',
        ...common,
        width: 34,
        height: 220,
        behavior: {
          type: 'phase',
          cycleMs: 4000,
          solidMs: 1500,
          warningMs: 450,
          offsetMs: 0,
        },
      },
    },
    pulse: {
      group: 'dynamicObstacles',
      entity: {
        id: `pulse-${sequence}`,
        mediaId: 'obstacle-pulse-block',
        shape: 'rect',
        ...common,
        width: 140,
        height: 40,
        behavior: {
          type: 'pulse',
          minScale: 0.5,
          maxScale: 1.3,
          periodMs: 3500,
          phase: 0,
        },
      },
    },
    orbit: {
      group: 'dynamicObstacles',
      entity: {
        id: `orbit-${sequence}`,
        mediaId: 'obstacle-orbiter',
        shape: 'circle',
        ...common,
        size: 42,
        behavior: {
          type: 'orbit',
          radiusX: 90,
          radiusY: 110,
          periodMs: 4200,
          phase: 0,
        },
      },
    },
    rotate: {
      group: 'dynamicObstacles',
      entity: {
        id: `spinner-${sequence}`,
        mediaId: 'obstacle-spinner',
        shape: 'rect',
        ...common,
        width: 220,
        height: 28,
        behavior: {
          type: 'rotate',
          speedDegreesPerSecond: 75,
          initialDegrees: 0,
        },
      },
    },
    switch: {
      group: 'switches',
      entity: {
        id: `switch-${sequence}`,
        mediaId: 'switch-pad',
        ...common,
        size: 44,
        activation: 'once',
        durationMs: 0,
      },
    },
    switchBarrier: {
      group: 'dynamicObstacles',
      entity: {
        id: `switch-barrier-${sequence}`,
        mediaId: 'obstacle-switch-barrier',
        shape: 'rect',
        ...common,
        width: 34,
        height: 240,
        behavior: {
          type: 'switch',
          switchId: level.switches?.[0]?.id ?? 'switch-required',
          initiallySolid: true,
        },
      },
    },
    conveyor: {
      group: 'forceFields',
      entity: {
        id: `current-${sequence}`,
        mediaId: 'field-conveyor',
        type: 'conveyor',
        ...common,
        width: 260,
        height: 140,
        directionDegrees: 0,
        force: 300,
      },
    },
    radial: {
      group: 'forceFields',
      entity: {
        id: `radial-${sequence}`,
        mediaId: 'field-radial',
        type: 'repulsor',
        ...common,
        radius: 120,
        force: 550,
      },
    },
    coin: {
      group: 'coins',
      entity: {
        id: `coin-${sequence}`,
        mediaId: 'coin-standard',
        ...common,
        size: 30,
        value: 1,
      },
    },
    bonus: {
      group: 'bonusTargets',
      entity: {
        id: `bonus-${sequence}`,
        mediaId: 'target-bonus',
        ...common,
        size: 48,
      },
    },
  }
  const template = templates[type]
  if (!template) return level
  if (template.group === 'bonusTargets') {
    return {
      ...level,
      bonuses: {
        ...level.bonuses,
        targets: [...level.bonuses.targets, template.entity],
        maximumTargets: level.bonuses.maximumTargets + 1,
      },
    }
  }
  return {
    ...level,
    [template.group]: [...(level[template.group] ?? []), template.entity],
  }
}

/**
 * Renders and manipulates level entities on the 1600 × 900 editor map.
 *
 * @param {object} props Level geometry, selection, and edit callbacks.
 * @returns {import('react').JSX.Element} Interactive level map.
 */
function LevelMap({
  level,
  selection,
  onSelect,
  onMove,
  onResize,
  onArenaPointMove,
  onArenaPointSelect,
  selectedArenaPoint,
  onContextMenu,
  onDragStart,
  onDragEnd,
}) {
  const dragRef = useRef(null)
  const descriptors = entityDescriptors(level)

  /**
   * Moves the selected entity from pointer coordinates and snaps it to the grid.
   *
   * @param {import('react').PointerEvent} event Map pointer event.
   * @returns {void}
   */
  const handlePointerMove = (event) => {
    if (!dragRef.current) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const point = {
      x: snap(((event.clientX - bounds.left) / bounds.width) * 1600),
      y: snap(((event.clientY - bounds.top) / bounds.height) * 900),
    }
    if (dragRef.current.mode === 'resize') {
      onResize(
        dragRef.current.selection,
        resizeEntity(
          dragRef.current.initialEntity,
          dragRef.current.handle,
          point,
        ),
      )
      return
    }
    if (dragRef.current.mode === 'arena-point') {
      onArenaPointMove(dragRef.current.index, point)
      return
    }
    onMove(dragRef.current.selection, point)
  }

  return (
    <div
      className="level-editor-map"
      role="application"
      aria-label="10-unit level placement grid"
      onPointerMove={handlePointerMove}
      onPointerUp={() => {
        if (dragRef.current) onDragEnd()
        dragRef.current = null
      }}
      onPointerLeave={() => {
        if (dragRef.current) onDragEnd()
        dragRef.current = null
      }}
    >
      <svg
        className="level-editor-arena"
        viewBox="0 0 1600 900"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {level.arena.shape === 'polygon' ? (
          <polygon className="level-editor-arena__boundary" points={level.arena.points.map((point) => point.join(',')).join(' ')} />
        ) : level.arena.shape === 'ellipse' ? (
          <ellipse
            className="level-editor-arena__boundary"
            cx="800"
            cy="450"
            rx={800 - level.arena.margin}
            ry={450 - level.arena.margin}
          />
        ) : (
          <rect
            className="level-editor-arena__boundary"
            x={level.arena.margin}
            y={level.arena.margin}
            width={1600 - level.arena.margin * 2}
            height={900 - level.arena.margin * 2}
            rx={level.arena.cornerRadius}
          />
        )}
        <g className="level-editor-hazard-guides">
          {(level.movingObstacles ?? []).map((obstacle) => (
            <line
              key={`moving-guide-${obstacle.id}`}
              x1={obstacle.x - (obstacle.axis === 'x' ? obstacle.amplitude : 0)}
              y1={obstacle.y - (obstacle.axis === 'y' ? obstacle.amplitude : 0)}
              x2={obstacle.x + (obstacle.axis === 'x' ? obstacle.amplitude : 0)}
              y2={obstacle.y + (obstacle.axis === 'y' ? obstacle.amplitude : 0)}
            />
          ))}
          {(level.trackingObstacles ?? []).map((obstacle) => (
            <rect
              key={`tracking-guide-${obstacle.id}`}
              x={obstacle.zone.x}
              y={obstacle.zone.y}
              width={obstacle.zone.width}
              height={obstacle.zone.height}
            />
          ))}
          {(level.dynamicObstacles ?? []).map((obstacle) => {
            if (obstacle.behavior.type === 'orbit') {
              return (
                <ellipse
                  key={`dynamic-guide-${obstacle.id}`}
                  cx={obstacle.x}
                  cy={obstacle.y}
                  rx={obstacle.behavior.radiusX}
                  ry={obstacle.behavior.radiusY}
                />
              )
            }
            if (obstacle.behavior.type === 'pulse') {
              return (
                <rect
                  key={`dynamic-guide-${obstacle.id}`}
                  x={obstacle.x - (obstacle.width * obstacle.behavior.maxScale) / 2}
                  y={obstacle.y - (obstacle.height * obstacle.behavior.maxScale) / 2}
                  width={obstacle.width * obstacle.behavior.maxScale}
                  height={obstacle.height * obstacle.behavior.maxScale}
                />
              )
            }
            if (obstacle.behavior.type === 'rotate') {
              return (
                <circle
                  key={`dynamic-guide-${obstacle.id}`}
                  cx={obstacle.x}
                  cy={obstacle.y}
                  r={Math.hypot(obstacle.width, obstacle.height) / 2}
                />
              )
            }
            return null
          })}
        </g>
      </svg>
      {level.arena.shape === 'polygon' &&
        level.arena.points.map(([x, y], index) => (
          <button
            type="button"
            className={`arena-point-handle ${selectedArenaPoint === index ? 'is-selected' : ''}`}
            aria-label={`Arena corner ${index + 1}`}
            aria-pressed={selectedArenaPoint === index}
            key={`arena-point-${index}`}
            style={{ left: `${(x / 1600) * 100}%`, top: `${(y / 900) * 100}%` }}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              event.preventDefault()
              event.stopPropagation()
              dragRef.current = { mode: 'arena-point', index }
              onArenaPointSelect(index)
              onDragStart()
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onClick={() => onArenaPointSelect(index)}
          >
            <span>{index + 1}</span>
          </button>
        ))}
      {descriptors.map((descriptor) => {
        const size = entitySize(descriptor.entity)
        const selected =
          selection?.group === descriptor.group &&
          selection?.index === descriptor.index
        const descriptorSelection = {
          group: descriptor.group,
          index: descriptor.index,
        }
        return (
          <button
            className={`editor-entity editor-entity--${descriptor.group} ${
              selected ? 'is-selected' : ''
            }`}
            key={`${descriptor.group}-${descriptor.index ?? 'root'}`}
            type="button"
            title={descriptor.label}
            style={{
              left: `${(descriptor.entity.x / 1600) * 100}%`,
              top: `${(descriptor.entity.y / 900) * 100}%`,
              width: `max(12px, ${(size.width / 1600) * 100}%)`,
              height: `max(12px, ${(size.height / 900) * 100}%)`,
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              event.preventDefault()
              dragRef.current = {
                mode: 'move',
                selection: descriptorSelection,
              }
              onDragStart()
              onSelect(descriptorSelection)
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onClick={() =>
              onSelect(descriptorSelection)
            }
            onContextMenu={(event) => {
              event.preventDefault()
              onSelect(descriptorSelection)
              onContextMenu(descriptorSelection, {
                x: event.clientX,
                y: event.clientY,
              })
            }}
            onKeyDown={(event) => {
              if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) {
                return
              }
              event.preventDefault()
              const bounds = event.currentTarget.getBoundingClientRect()
              onSelect(descriptorSelection)
              onContextMenu(descriptorSelection, {
                x: bounds.right,
                y: bounds.top,
              })
            }}
          >
            <span className="editor-entity__label">{descriptor.label}</span>
            {selected && isResizableEntity(descriptor.entity) &&
              RESIZE_HANDLES.map((handle) => (
                <span
                  aria-hidden="true"
                  className={`editor-resize-handle editor-resize-handle--${handle}`}
                  data-resize-handle={handle}
                  key={handle}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return
                    event.preventDefault()
                    event.stopPropagation()
                    dragRef.current = {
                      mode: 'resize',
                      selection: descriptorSelection,
                      handle,
                      initialEntity: descriptor.entity,
                    }
                    onDragStart()
                    event.currentTarget.setPointerCapture(event.pointerId)
                  }}
                />
              ))}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Presents a modal, schema-aware editor for one complete level document.
 *
 * @param {object} props JSON editor properties.
 * @returns {import('react').JSX.Element} Modal level JSON editor.
 */
function LevelJsonEditor({ themeId, level, onApply, onClose }) {
  const [draft, setDraft] = useState(() => JSON.stringify(level, null, 2))
  const [validation, setValidation] = useState({ state: 'idle', errors: [] })
  const lines = draft.split('\n').length

  /** Opens the author-facing Markdown field reference in a separate popup. */
  const openJsonReference = () => {
    const referenceUrl = new URL(
      `${import.meta.env.BASE_URL}docs/theme-workshop-json-reference.html`,
      window.location.href,
    )
    window.open(
      referenceUrl.href,
      'path-protocol-theme-json-reference',
      'popup=yes,width=980,height=760,resizable=yes,scrollbars=yes',
    )
  }

  /**
   * Parses the JSON editor draft or exposes a user-facing syntax error.
   *
   * @returns {object|null} Parsed level document when valid JSON.
   */
  const parseDraft = () => {
    try {
      return { value: JSON.parse(draft), error: null }
    } catch (error) {
      return { value: null, error: error.message }
    }
  }

  /** @returns {Promise<void>} Completion of server-side schema and gameplay validation. */
  const validateDraft = async () => {
    const parsed = parseDraft()
    if (parsed.error) {
      const result = { state: 'invalid', errors: [parsed.error] }
      setValidation(result)
      return { ...parsed, valid: false }
    }
    setValidation({ state: 'checking', errors: [] })
    try {
      const result = await themeApi.validateLevel(themeId, parsed.value)
      setValidation({
        state: result.valid ? 'valid' : 'invalid',
        errors: result.errors,
      })
      return { ...parsed, valid: result.valid }
    } catch (error) {
      setValidation({
        state: 'invalid',
        errors: [error.message, ...(error.details ?? [])],
      })
      return { ...parsed, valid: false }
    }
  }

  /**
   * Inserts two spaces for Tab while preserving the text selection.
   *
   * @param {import('react').KeyboardEvent<HTMLTextAreaElement>} event Editor key event.
   * @returns {void}
   */
  const insertIndent = (event) => {
    if (event.key !== 'Tab') return
    event.preventDefault()
    const textarea = event.currentTarget
    const next = `${draft.slice(0, textarea.selectionStart)}  ${draft.slice(textarea.selectionEnd)}`
    const cursor = textarea.selectionStart + 2
    setDraft(next)
    window.requestAnimationFrame(() => textarea.setSelectionRange(cursor, cursor))
  }

  return (
    <div
      className="json-editor-backdrop"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <section
        className="json-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="level-json-editor-title"
      >
        <header>
          <div>
            <p className="eyebrow">Schema-aware editor</p>
            <h2 id="level-json-editor-title">Full level JSON</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close JSON editor">
            ×
          </button>
        </header>
        <div className="json-editor-toolbar">
          <button
            type="button"
            onClick={() => {
              const parsed = parseDraft()
              if (parsed.error) {
                setValidation({ state: 'invalid', errors: [parsed.error] })
                return
              }
              setDraft(JSON.stringify(parsed.value, null, 2))
              setValidation({ state: 'idle', errors: [] })
            }}
          >
            Format JSON
          </button>
          <button type="button" onClick={validateDraft}>
            Validate JSON
          </button>
          <button type="button" onClick={openJsonReference}>
            Open node and property guide
          </button>
          <span>{lines} lines · JSON Schema + generated-course checks</span>
        </div>
        <textarea
          autoFocus
          aria-label="Full level JSON"
          spellCheck="false"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            setValidation({ state: 'idle', errors: [] })
          }}
          onKeyDown={insertIndent}
        />
        <div
          className={`json-editor-validation is-${validation.state}`}
          role={validation.state === 'invalid' ? 'alert' : 'status'}
        >
          {validation.state === 'idle' && 'Not validated since the last edit.'}
          {validation.state === 'checking' && 'Validating against the level schema…'}
          {validation.state === 'valid' && 'Schema and gameplay validation passed.'}
          {validation.state === 'invalid' && (
            <>
              <strong>Validation failed</strong>
              <ul>
                {validation.errors.map((error, index) => (
                  <li key={`${error}-${index}`}>{error}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        <footer>
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            onClick={async () => {
              const result = await validateDraft()
              if (!result.valid) return
              onApply(result.value)
            }}
          >
            Validate and apply
          </button>
        </footer>
      </section>
    </div>
  )
}

/**
 * Presents JSON for only one selected object and validates it in level context.
 *
 * @param {object} props Object JSON editor properties.
 * @returns {import('react').JSX.Element} Modal selected-object JSON editor.
 */
function EntityJsonEditor({ themeId, level, selection, entity, onApply, onClose }) {
  const [draft, setDraft] = useState(() => JSON.stringify(entity, null, 2))
  const [validation, setValidation] = useState({ state: 'idle', errors: [] })

  /** @returns {{value:object|null,error:string|null}} Parsed and snapped object draft. */
  const parseDraft = () => {
    try {
      const value = JSON.parse(draft)
      if (!value || Array.isArray(value) || typeof value !== 'object') {
        return { value: null, error: 'The selected object JSON must be an object.' }
      }
      if (typeof value.x === 'number') value.x = snap(value.x)
      if (typeof value.y === 'number') value.y = snap(value.y)
      return { value, error: null }
    } catch (error) {
      return { value: null, error: error.message }
    }
  }

  /** @returns {Promise<{valid:boolean,value:object|null,nextLevel:object|null}>} Validation result. */
  const validateDraft = async () => {
    const parsed = parseDraft()
    if (parsed.error) {
      setValidation({ state: 'invalid', errors: [parsed.error] })
      return { valid: false, value: null, nextLevel: null }
    }
    const nextLevel = replaceEntity(level, selection, parsed.value)
    setValidation({ state: 'checking', errors: [] })
    try {
      const result = await themeApi.validateLevel(themeId, nextLevel)
      setValidation({
        state: result.valid ? 'valid' : 'invalid',
        errors: result.errors,
      })
      return { valid: result.valid, value: parsed.value, nextLevel }
    } catch (error) {
      setValidation({
        state: 'invalid',
        errors: [error.message, ...(error.details ?? [])],
      })
      return { valid: false, value: parsed.value, nextLevel }
    }
  }

  return (
    <div
      className="json-editor-backdrop"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <section
        className="json-editor-dialog entity-json-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="entity-json-editor-title"
      >
        <header>
          <div>
            <p className="eyebrow">Selected object only</p>
            <h2 id="entity-json-editor-title">
              Object JSON: {entity.id ?? selection.group}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close object JSON editor">
            ×
          </button>
        </header>
        <div className="json-editor-toolbar">
          <button
            type="button"
            onClick={() => {
              const parsed = parseDraft()
              if (parsed.error) {
                setValidation({ state: 'invalid', errors: [parsed.error] })
                return
              }
              setDraft(JSON.stringify(parsed.value, null, 2))
              setValidation({ state: 'idle', errors: [] })
            }}
          >
            Format object JSON
          </button>
          <button type="button" onClick={validateDraft}>Validate object JSON</button>
          <span>Only this object · validated in the complete level</span>
        </div>
        <textarea
          autoFocus
          aria-label="Selected object JSON"
          spellCheck="false"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            setValidation({ state: 'idle', errors: [] })
          }}
        />
        <div
          className={`json-editor-validation is-${validation.state}`}
          role={validation.state === 'invalid' ? 'alert' : 'status'}
        >
          {validation.state === 'idle' && 'Not validated since the last edit.'}
          {validation.state === 'checking' && 'Validating this object in the level…'}
          {validation.state === 'valid' && 'Object and complete level validation passed.'}
          {validation.state === 'invalid' && (
            <>
              <strong>Validation failed</strong>
              <ul>
                {validation.errors.map((error, index) => (
                  <li key={`${error}-${index}`}>{error}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        <footer>
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            onClick={async () => {
              const result = await validateDraft()
              if (result.valid) onApply(result.nextLevel)
            }}
          >
            Validate and apply object
          </button>
        </footer>
      </section>
    </div>
  )
}

/**
 * Returns the logical sound event that a selected entity may override.
 *
 * @pure
 * @param {{group:string}|null} selection Editor entity selection.
 * @returns {string|null} Default sound ID, or `null` for entities without a discrete sound event.
 */
function entityDefaultSoundId(selection) {
  if (selection?.group === 'coins') return 'coin-collected'
  if (selection?.group === 'switches') return 'target-reached'
  if (['mainTarget', 'bonusTargets'].includes(selection?.group)) {
    return 'target-reached'
  }
  return null
}

/**
 * Browses the read-only PublicMedia catalog with folders, search, paging, and preview.
 *
 * @param {object} props Browser state and selection callback.
 * @returns {import('react').JSX.Element} Shared filesystem-style media browser.
 */
function PublicMediaBrowser({
  kind,
  enabled,
  emptyMessage,
  actionLabel,
  onApply,
}) {
  const [folder, setFolder] = useState('')
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [catalog, setCatalog] = useState({
    items: [],
    total: 0,
    limit: 60,
    folders: [],
    collections: [],
  })
  const [selectedAssetId, setSelectedAssetId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState(
    enabled ? 'Loading media library…' : emptyMessage,
  )
  const selectedAsset = catalog.items.find((item) => item.id === selectedAssetId)

  /** @param {number} bytes Storage bytes. @returns {string} Compact binary size. */
  const formatBytes = (bytes) => {
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
  }

  /** @returns {Promise<void>} Completion of filtered catalog-page loading. */
  const loadCatalog = useCallback(async () => {
    if (!enabled) return
    try {
      setStatus('Loading media library…')
      const result = await mediaLibraryApi.list({
        kind,
        folder,
        query,
        offset,
        limit: 60,
      })
      setCatalog(result)
      setSelectedAssetId('')
      setStatus(
        `${result.folders.length} folders and ${result.total} ${kind} files in this view.`,
      )
    } catch (error) {
      setStatus(error.message)
    }
  }, [enabled, folder, kind, offset, query])

  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  /** @param {string} nextFolder Catalog-relative folder path. @returns {void} */
  const selectFolder = (nextFolder) => {
    setFolder(nextFolder)
    setQuery('')
    setSelectedAssetId('')
    setOffset(0)
    setCatalog((current) => ({
      ...current,
      items: [],
      total: 0,
      folders: [],
    }))
    setStatus('Loading media folder…')
  }

  /** @returns {Promise<void>} Completion of applying the selected catalog asset. */
  const applySelection = async () => {
    if (!selectedAssetId) return
    try {
      setStatus(
        kind === 'audio'
          ? 'Normalizing WAV and generating WebM/MP3…'
          : 'Copying image into the theme…',
      )
      const resultStatus = await onApply(selectedAssetId)
      if (resultStatus) setStatus(resultStatus)
    } catch (error) {
      setStatus([error.message, ...(error.details ?? [])].join(' '))
    }
  }

  /** @param {import('react').ChangeEvent<HTMLInputElement>} event File selection. @returns {Promise<void>} Upload completion. */
  const uploadFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setUploading(true)
      setStatus(`Validating and normalizing ${file.name}…`)
      await mediaLibraryApi.upload(kind, file)
      setFolder('uploads')
      setQuery('')
      setOffset(0)
      setStatus(`${file.name} uploaded. It is ready to select from My uploads.`)
    } catch (error) {
      const quotaText = error.quota
        ? ` ${formatBytes(error.quota.usedBytes)} of ${formatBytes(error.quota.limitBytes)} is already used.`
        : ''
      setStatus(`${[error.message, ...(error.details ?? [])].join(' ')}${quotaText}`)
    } finally {
      setUploading(false)
    }
  }

  /** @returns {Promise<void>} Completion of deleting the selected personal source. */
  const deleteUpload = async () => {
    if (!selectedAssetId.startsWith('uploads/')) return
    try {
      setStatus(`Deleting ${selectedAsset.name}…`)
      await mediaLibraryApi.removeUpload(selectedAssetId)
      setSelectedAssetId('')
      await loadCatalog()
      setStatus('Personal upload deleted. Existing theme copies are unchanged.')
    } catch (error) {
      setStatus(error.message)
    }
  }

  if (!enabled) {
    return <div className="theme-media-editor__empty">{emptyMessage}</div>
  }

  return (
    <div className="public-media-browser">
      <div className="theme-media-upload">
        <div>
          <strong>Personal media</strong>
          <small>
            {catalog.quota
              ? `${formatBytes(catalog.quota.usedBytes)} used · ${formatBytes(catalog.quota.remainingBytes)} remaining of ${formatBytes(catalog.quota.limitBytes)}`
              : 'Sign in to upload personal media.'}
          </small>
        </div>
        <label className="button-like">
          {uploading ? 'Uploading…' : `Upload ${kind}`}
          <input
            type="file"
            accept={kind === 'image' ? '.png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml' : '.wav,.ogg,.mp3,.aif,.aiff,audio/*'}
            disabled={uploading || !catalog.quota}
            onChange={uploadFile}
          />
        </label>
      </div>
      <div className="theme-media-browser">
        <aside className="theme-media-folders" aria-label="PublicMedia folders">
          <strong>PublicMedia</strong>
          <button
            type="button"
            className={!folder ? 'is-selected' : ''}
            onClick={() => selectFolder('')}
          >
            <span>⌂ Root</span>
            <small>{catalog.collections.reduce((sum, item) => sum + item.count, 0)}</small>
          </button>
          {catalog.collections.map((item) => (
            <button
              type="button"
              key={item.id}
              className={folder === item.id ? 'is-selected' : ''}
              onClick={() => selectFolder(item.id)}
            >
              <span>▸ {item.id === 'uploads' ? 'My uploads' : item.id}</span>
              <small>{item.count}</small>
            </button>
          ))}
        </aside>
        <div className="theme-media-browser__content">
          <div className="theme-media-browser__toolbar">
            <nav className="theme-media-breadcrumbs" aria-label="Media folder path">
              <button type="button" onClick={() => selectFolder('')}>PublicMedia</button>
              {folder.split('/').filter(Boolean).map((segment, index, segments) => (
                <span key={segments.slice(0, index + 1).join('/')}>
                  <span aria-hidden="true">/</span>
                  <button
                    type="button"
                    onClick={() => selectFolder(segments.slice(0, index + 1).join('/'))}
                  >
                    {segment}
                  </button>
                </span>
              ))}
            </nav>
            <label>
              Search this view
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setOffset(0)
                }}
                placeholder="planet, coin, impact…"
              />
            </label>
          </div>
          <div className="theme-media-grid">
            {!query && catalog.folders.map((item) => (
              <button
                type="button"
                className="theme-media-folder-tile"
                key={item.path}
                onClick={() => selectFolder(item.path)}
                title={item.path}
              >
                <span aria-hidden="true">📁</span>
                <small>{item.name}</small>
                <em>{item.count} files</em>
              </button>
            ))}
            {catalog.items.map((asset) => {
              const relativePath = asset.id.slice(asset.collection.length + 1)
              const assetFolder = relativePath.includes('/')
                ? relativePath.slice(0, relativePath.lastIndexOf('/'))
                : 'root'
              return (
                <button
                  type="button"
                  key={asset.id}
                  className={asset.id === selectedAssetId ? 'is-selected' : ''}
                  aria-pressed={asset.id === selectedAssetId}
                  onClick={() => setSelectedAssetId(asset.id)}
                  title={asset.id}
                >
                  {kind === 'image' ? (
                    <img
                      src={mediaLibraryApi.fileUrl(asset.id)}
                      alt={`Preview of ${asset.name}`}
                      loading="lazy"
                    />
                  ) : (
                    <span aria-hidden="true">♪</span>
                  )}
                  <small>{asset.name}</small>
                  <em>{assetFolder}</em>
                </button>
              )
            })}
            {!catalog.items.length && !catalog.folders.length && (
              <p>No media matches this folder and search.</p>
            )}
          </div>
        </div>
      </div>
      {selectedAsset && (
        <section className="theme-media-preview" aria-label="Selected media preview">
          {kind === 'image' ? (
            <img
              src={mediaLibraryApi.fileUrl(selectedAsset.id)}
              alt={`Large preview of ${selectedAsset.name}`}
            />
          ) : (
            <audio controls preload="metadata" src={mediaLibraryApi.fileUrl(selectedAsset.id)}>
              Audio preview is unavailable in this browser.
            </audio>
          )}
          <div>
            <strong>{selectedAsset.name}</strong>
            <small>{selectedAsset.id}</small>
            <p className="theme-media-editor__license">
              <strong>{selectedAsset.license}</strong>
              {selectedAsset.credit && ` · ${selectedAsset.credit}`}
              {selectedAsset.sourceUrl.startsWith('http') && (
                <>
                  {' · '}
                  <a href={selectedAsset.sourceUrl} target="_blank" rel="noreferrer">
                    Source and license
                  </a>
                </>
              )}
            </p>
            {selectedAsset.id.startsWith('uploads/') && (
              <button type="button" onClick={deleteUpload}>
                Delete uploaded source
              </button>
            )}
          </div>
        </section>
      )}
      <div className="theme-media-editor__actions">
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - catalog.limit))}
        >
          Previous
        </button>
        <span>
          {catalog.total
            ? `${offset + 1}–${Math.min(offset + catalog.items.length, catalog.total)} of ${catalog.total} files`
            : `${catalog.folders.length} folders`}
        </span>
        <button
          type="button"
          disabled={offset + catalog.limit >= catalog.total}
          onClick={() => setOffset(offset + catalog.limit)}
        >
          Next
        </button>
        <button type="button" disabled={!selectedAssetId} onClick={applySelection}>
          {actionLabel}
        </button>
      </div>
      <div role="status">{status}</div>
    </div>
  )
}

/**
 * Lets an author copy a PublicMedia asset for only the selected level entity.
 *
 * @param {object} props Dialog properties.
 * @returns {import('react').JSX.Element} Entity media override dialog.
 */
function EntityMediaOverrideDialog({
  themeId,
  entity,
  selection,
  initialKind = 'visual',
  onApply,
  onClose,
}) {
  const defaultSoundId = entityDefaultSoundId(selection)
  const [kind, setKind] = useState(
    initialKind === 'audio' && defaultSoundId ? 'audio' : 'visual',
  )

  /** @param {string} assetId Selected PublicMedia asset ID. @returns {Promise<void>} Completion. */
  const apply = async (assetId) => {
    const property = kind === 'visual' ? 'visualOverrideId' : 'audioOverrideId'
    const baseId = kind === 'visual' ? entity.mediaId : defaultSoundId
    const result = await themeApi.setEntityMediaOverride(themeId, {
      kind,
      baseId,
      assetId,
    })
    await onApply({ ...entity, [property]: result.overrideId })
    onClose()
  }

  return (
    <div className="json-editor-backdrop" role="presentation">
      <section
        className="json-editor-dialog entity-media-browser-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="entity-media-override-title"
      >
        <header>
          <div>
            <p className="eyebrow">Selected object override</p>
            <h2 id="entity-media-override-title">
              {entity.id ?? selection.group} media
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close media override">
            ×
          </button>
        </header>
        <div className="entity-media-browser-dialog__body">
          <p>
            This changes only this object. Its normal <code>mediaId</code> and
            sound remain as automatic fallbacks.
          </p>
          <div className="theme-media-editor__controls">
            <label>
              Override type
              <select value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="visual">Image</option>
                <option value="audio" disabled={!defaultSoundId}>
                  Audio{defaultSoundId ? ` (${defaultSoundId})` : ' (no event)'}
                </option>
              </select>
            </label>
          </div>
          <PublicMediaBrowser
            key={kind}
            kind={kind === 'visual' ? 'image' : 'audio'}
            enabled
            emptyMessage=""
            actionLabel={`Apply ${kind === 'visual' ? 'image' : 'sound'} to selected object`}
            onApply={apply}
          />
          <div className="entity-media-browser-dialog__footer">
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </section>
    </div>
  )
}

/**
 * Coordinates level history, validation, autosave, properties, and playtesting.
 *
 * @param {object} props Theme level data and persistence callbacks.
 * @returns {import('react').JSX.Element} Full Workshop level editor.
 */
function LevelEditor({
  theme,
  initialLevel,
  onClose,
  onThemeChanged,
  audio,
  mediaManifest,
  reducedMotion,
  gameplayConfig,
  powerups,
}) {
  const [level, setLevel] = useState(initialLevel)
  const [selection, setSelection] = useState({ group: 'start', index: null })
  const [selectedArenaPoint, setSelectedArenaPoint] = useState(null)
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const [entityJson, setEntityJson] = useState('')
  const [jsonEditorOpen, setJsonEditorOpen] = useState(false)
  const [entityJsonOpen, setEntityJsonOpen] = useState(false)
  const [entityMediaOpen, setEntityMediaOpen] = useState(false)
  const [entityMediaKind, setEntityMediaKind] = useState('visual')
  const [contextMenu, setContextMenu] = useState(null)
  const [editorManifest, setEditorManifest] = useState(mediaManifest)
  const [status, setStatus] = useState('All changes saved.')
  const [playtest, setPlaytest] = useState(false)
  const initialRender = useRef(true)
  const dragSnapshot = useRef(null)

  const runtime = useMemo(() => {
    try {
      return { level: generateLevel(level), error: null }
    } catch (error) {
      return { level: null, error: error.message }
    }
  }, [level])

  useEffect(() => {
    setEntityJson(JSON.stringify(getEntity(level, selection), null, 2))
  }, [level, selection])

  useEffect(() => {
    themeApi
      .mediaManifest(theme.id)
      .then(async (manifest) => {
        await Promise.all(
          manifest.audio
            .filter((entry) => entry.soundId.startsWith('entity-audio-'))
            .map((entry) => audio.loadSound(entry)),
        )
        setEditorManifest(manifest)
      })
      .catch(() => setEditorManifest(mediaManifest))
  }, [audio, mediaManifest, theme.id])

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false
      return undefined
    }
    setStatus('Checking autosave…')
    const timer = window.setTimeout(() => {
      themeApi
        .saveLevel(theme.id, level.internalId, level)
        .then(() => setStatus('Autosaved.'))
        .catch((error) =>
          setStatus(
            `Not saved: ${[error.message, ...(error.details ?? [])].join(' ')}`,
          ),
        )
    }, 900)
    return () => window.clearTimeout(timer)
  }, [level, theme.id])

  /** @param {object} next Next level document. @returns {void} */
  const commit = (next) => {
    setUndoStack((items) => [...items.slice(-49), level])
    setRedoStack([])
    setLevel(next)
  }

  /** @returns {Promise<void>} Completion of immediate validated level persistence. */
  const saveNow = async () => {
    setStatus('Validating and saving…')
    try {
      await themeApi.saveLevel(theme.id, level.internalId, level)
      setStatus('Valid save completed.')
    } catch (error) {
      setStatus(
        `Not saved: ${[error.message, ...(error.details ?? [])].join(' ')}`,
      )
    }
  }

  if (playtest && runtime.level) {
    return (
      <section className="workshop-playtest">
        <button type="button" onClick={() => setPlaytest(false)}>
          ← Return to editor
        </button>
        <GameView
          key={`${runtime.level.id}-${runtime.level.seed}`}
          level={runtime.level}
          levelBest={0}
          cumulative={0}
          audio={audio}
          onComplete={() => setPlaytest(false)}
          onAttemptFailed={() => {}}
          onExit={() => setPlaytest(false)}
          devMode
          onPreviousLevel={() => {}}
          onNextLevel={() => {}}
          totalLevels={1}
          powerups={powerups}
          inventory={{}}
          collectedCoins={{}}
          onUsePowerup={() => true}
          onCoinCollected={() => true}
          mediaManifest={editorManifest}
          reducedMotion={reducedMotion}
          tokenCollisionTolerance={gameplayConfig.collision.tokenToleranceUnits}
          collisionGuideStyle={{ color: 0x36d7ff, width: 2 }}
          pointerResponsePerSecond={gameplayConfig.input.pointerResponsePerSecond}
          keyboardSpeedUnitsPerSecond={
            gameplayConfig.input.keyboardSpeedUnitsPerSecond
          }
        />
      </section>
    )
  }

  return (
    <main className="theme-editor">
      <header className="theme-editor__header">
        <div>
          <p className="eyebrow">Theme Workshop // {theme.name}</p>
          <h1>
            {level.number}. {level.name}
          </h1>
          <p aria-live="polite">{status}</p>
        </div>
        <div className="theme-editor__actions">
          <button
            type="button"
            disabled={!undoStack.length}
            onClick={() => {
              const previous = undoStack.at(-1)
              setUndoStack((items) => items.slice(0, -1))
              setRedoStack((items) => [...items, level])
              setLevel(previous)
            }}
          >
            Undo
          </button>
          <button
            type="button"
            disabled={!redoStack.length}
            onClick={() => {
              const next = redoStack.at(-1)
              setRedoStack((items) => items.slice(0, -1))
              setUndoStack((items) => [...items, level])
              setLevel(next)
            }}
          >
            Redo
          </button>
          <button type="button" onClick={saveNow}>
            Validate and save
          </button>
          <button
            type="button"
            disabled={!runtime.level}
            onClick={() => setPlaytest(true)}
          >
            Playtest
          </button>
          <button type="button" onClick={onClose}>
            Close editor
          </button>
        </div>
      </header>

      <div className="theme-editor__layout">
        <section>
          <LevelMap
            level={level}
            selection={selection}
            onSelect={setSelection}
            onMove={(target, point) => {
              const entity = getEntity(level, target)
              setLevel(replaceEntity(level, target, { ...entity, ...point }))
            }}
            onResize={(target, entity) => {
              setLevel(replaceEntity(level, target, entity))
            }}
            selectedArenaPoint={selectedArenaPoint}
            onArenaPointSelect={setSelectedArenaPoint}
            onArenaPointMove={(index, point) => {
              setLevel({
                ...level,
                arena: moveArenaPoint(level.arena, index, point),
              })
            }}
            onContextMenu={(target, point) => {
              setContextMenu({
                selection: target,
                x: Math.max(8, Math.min(point.x, window.innerWidth - 230)),
                y: Math.max(8, Math.min(point.y, window.innerHeight - 190)),
              })
            }}
            onDragStart={() => {
              dragSnapshot.current = level
            }}
            onDragEnd={() => {
              if (
                dragSnapshot.current &&
                JSON.stringify(dragSnapshot.current) !== JSON.stringify(level)
              ) {
                setUndoStack((items) => [
                  ...items.slice(-49),
                  dragSnapshot.current,
                ])
                setRedoStack([])
              }
              dragSnapshot.current = null
            }}
          />
          <p className="editor-help">
            Drag entities on the 10-unit grid. Polygon arena corners are numbered
            and draggable. Select an object and drag an edge or corner handle to
            resize it. Right-click for image, sound, and object-only JSON actions.
          </p>
          {runtime.error && <div role="alert">{runtime.error}</div>}
        </section>

        <aside className="entity-inspector">
          <label>
            Level name
            <input
              value={level.name}
              onChange={(event) => commit({ ...level, name: event.target.value })}
            />
          </label>
          <label>
            Briefing
            <textarea
              value={level.briefing}
              onChange={(event) =>
                commit({ ...level, briefing: event.target.value })
              }
            />
          </label>
          <label>
            Seed
            <input
              value={level.seed}
              onChange={(event) => commit({ ...level, seed: event.target.value })}
            />
          </label>
          <button
            type="button"
            onClick={() =>
              commit({
                ...level,
                seed: `${level.seed.replace(/-regen-[a-z0-9]+$/, '')}-regen-${Date.now().toString(36)}`,
              })
            }
          >
            Change seed and regenerate
          </button>

          <section className="arena-editor-controls" aria-labelledby="arena-editor-title">
            <h2 id="arena-editor-title">Arena boundary</h2>
            <label>
              Arena shape
              <select
                value={level.arena.shape}
                onChange={(event) => {
                  const arena = convertArenaShape(level.arena, event.target.value)
                  commit({ ...level, arena })
                  setSelectedArenaPoint(arena.shape === 'polygon' ? 0 : null)
                }}
              >
                <option value="rect">Rounded rectangle</option>
                <option value="ellipse">Ellipse</option>
                <option value="polygon">Irregular polygon</option>
              </select>
            </label>
            {level.arena.shape === 'polygon' ? (
              <>
                <p>
                  Drag numbered corners on the map. Concave shapes are allowed;
                  crossed edges are rejected during validation.
                </p>
                <div className="arena-editor-controls__actions">
                  <button
                    type="button"
                    onClick={() => {
                      const added = addArenaPoint(level.arena)
                      commit({ ...level, arena: added.arena })
                      setSelectedArenaPoint(added.index)
                    }}
                  >
                    Add corner
                  </button>
                  <button
                    type="button"
                    disabled={selectedArenaPoint === null || level.arena.points.length <= 3}
                    onClick={() => {
                      const arena = removeArenaPoint(level.arena, selectedArenaPoint)
                      commit({ ...level, arena })
                      setSelectedArenaPoint(
                        arena.points.length
                          ? Math.min(selectedArenaPoint, arena.points.length - 1)
                          : null,
                      )
                    }}
                  >
                    Remove selected corner
                  </button>
                </div>
                {selectedArenaPoint !== null && level.arena.points[selectedArenaPoint] && (
                  <div className="arena-editor-controls__coordinates">
                    <label>
                      Corner {selectedArenaPoint + 1} X
                      <input
                        type="number"
                        min="0"
                        max="1600"
                        step="10"
                        value={level.arena.points[selectedArenaPoint][0]}
                        onChange={(event) =>
                          commit({
                            ...level,
                            arena: moveArenaPoint(level.arena, selectedArenaPoint, {
                              x: event.target.value,
                              y: level.arena.points[selectedArenaPoint][1],
                            }),
                          })
                        }
                      />
                    </label>
                    <label>
                      Corner {selectedArenaPoint + 1} Y
                      <input
                        type="number"
                        min="0"
                        max="900"
                        step="10"
                        value={level.arena.points[selectedArenaPoint][1]}
                        onChange={(event) =>
                          commit({
                            ...level,
                            arena: moveArenaPoint(level.arena, selectedArenaPoint, {
                              x: level.arena.points[selectedArenaPoint][0],
                              y: event.target.value,
                            }),
                          })
                        }
                      />
                    </label>
                  </div>
                )}
              </>
            ) : (
              <div className="arena-editor-controls__coordinates">
                <label>
                  Boundary margin
                  <input
                    type="number"
                    min="0"
                    max="400"
                    step="10"
                    value={level.arena.margin}
                    onChange={(event) =>
                      commit({
                        ...level,
                        arena: {
                          ...level.arena,
                          margin: Math.max(0, Math.min(400, snap(event.target.value))),
                        },
                      })
                    }
                  />
                </label>
                {level.arena.shape === 'rect' && (
                  <label>
                    Corner radius
                    <input
                      type="number"
                      min="0"
                      max="500"
                      step="10"
                      value={level.arena.cornerRadius}
                      onChange={(event) =>
                        commit({
                          ...level,
                          arena: {
                            ...level.arena,
                            cornerRadius: Math.max(0, Math.min(500, snap(event.target.value))),
                          },
                        })
                      }
                    />
                  </label>
                )}
              </div>
            )}
          </section>

          <label>
            Add entity
            <select
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) commit(addEntity(level, event.target.value))
                event.target.value = ''
              }}
            >
              <option value="">Choose type…</option>
              <option value="static">Static obstacle</option>
              <option value="moving">Axis sweeper (moves side to side)</option>
              <option value="tracking">Tracker (chases inside a zone)</option>
              <option value="phase">Phase gate (solid/open cycle)</option>
              <option value="pulse">Pulse block (grows and shrinks)</option>
              <option value="orbit">Orbiter (elliptical path)</option>
              <option value="rotate">Spinner (rotating collision bar)</option>
              <option value="switch">Switch pad</option>
              <option value="switchBarrier">Switch-controlled barrier</option>
              <option value="conveyor">Conveyor field</option>
              <option value="radial">Radial field</option>
              <option value="coin">Coin</option>
              <option value="bonus">Bonus target</option>
            </select>
          </label>
          <details className="obstacle-behavior-guide">
            <summary>What each obstacle actually does</summary>
            <div>
              {OBSTACLE_GUIDE.map((item) => (
                <article key={item.name}>
                  <strong>{item.name}</strong>
                  <p>{item.implementation}</p>
                </article>
              ))}
            </div>
            <p>
              Any solid obstacle uses the same complete-token swept collision,
              penalty, and last-safe-position restore rules. The third collision
              restarts the unchanged level layout.
            </p>
          </details>

          <h2>Entity inspector</h2>
          <textarea
            className="entity-json"
            aria-label="Selected entity JSON"
            value={entityJson}
            onChange={(event) => setEntityJson(event.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              try {
                const parsed = JSON.parse(entityJson)
                parsed.x = snap(parsed.x)
                parsed.y = snap(parsed.y)
                commit(replaceEntity(level, selection, parsed))
                setStatus('Inspector changes applied locally.')
              } catch {
                setStatus('Inspector JSON is invalid.')
              }
            }}
          >
            Apply entity JSON
          </button>
          <button
            type="button"
            disabled={!getEntity(level, selection)?.mediaId}
            onClick={() => {
              setEntityMediaKind('visual')
              setEntityMediaOpen(true)
            }}
          >
            Choose image or audio override
          </button>
          {(getEntity(level, selection)?.visualOverrideId ||
            getEntity(level, selection)?.audioOverrideId) && (
            <button
              type="button"
              onClick={() => {
                const entity = getEntity(level, selection)
                const next = { ...entity }
                delete next.visualOverrideId
                delete next.audioOverrideId
                commit(replaceEntity(level, selection, next))
              }}
            >
              Clear object media overrides
            </button>
          )}
          <button
            type="button"
            disabled={
              selection?.group === 'start' ||
              selection?.group === 'mainTarget'
            }
            onClick={() => {
              commit(removeEntity(level, selection))
              setSelection({ group: 'start', index: null })
            }}
          >
            Delete selected entity
          </button>
          <div className="advanced-json-launcher">
            <h2>Advanced level configuration</h2>
            <p>
              Edit arena, token, movement, generation, scoring, rewards, bonuses,
              and every mechanic contract in a validated popup editor.
            </p>
            <button type="button" onClick={() => setJsonEditorOpen(true)}>
              Open full-level JSON editor
            </button>
          </div>
        </aside>
      </div>

      {contextMenu && (
        <>
          <div
            className="entity-context-menu__dismiss"
            role="presentation"
            onPointerDown={() => setContextMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault()
              setContextMenu(null)
            }}
          />
          <div
            className="entity-context-menu"
            role="menu"
            aria-label="Selected object actions"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <strong>
              {getEntity(level, contextMenu.selection)?.id ??
                contextMenu.selection.group}
            </strong>
            <button
              type="button"
              role="menuitem"
              disabled={!getEntity(level, contextMenu.selection)?.mediaId}
              onClick={() => {
                setSelection(contextMenu.selection)
                setEntityMediaKind('visual')
                setEntityMediaOpen(true)
                setContextMenu(null)
              }}
            >
              Change image…
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!entityDefaultSoundId(contextMenu.selection)}
              onClick={() => {
                setSelection(contextMenu.selection)
                setEntityMediaKind('audio')
                setEntityMediaOpen(true)
                setContextMenu(null)
              }}
            >
              Change sound…
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setSelection(contextMenu.selection)
                setEntityJsonOpen(true)
                setContextMenu(null)
              }}
            >
              Show object JSON…
            </button>
          </div>
        </>
      )}

      {jsonEditorOpen && (
        <LevelJsonEditor
          themeId={theme.id}
          level={level}
          onClose={() => setJsonEditorOpen(false)}
          onApply={(nextLevel) => {
            commit(nextLevel)
            setJsonEditorOpen(false)
            setStatus('Validated full-level JSON applied locally.')
          }}
        />
      )}
      {entityJsonOpen && getEntity(level, selection) && (
        <EntityJsonEditor
          themeId={theme.id}
          level={level}
          selection={selection}
          entity={getEntity(level, selection)}
          onClose={() => setEntityJsonOpen(false)}
          onApply={(nextLevel) => {
            commit(nextLevel)
            setEntityJsonOpen(false)
            setStatus('Validated object JSON applied locally.')
          }}
        />
      )}
      {entityMediaOpen && getEntity(level, selection) && (
        <EntityMediaOverrideDialog
          themeId={theme.id}
          entity={getEntity(level, selection)}
          selection={selection}
          initialKind={entityMediaKind}
          onClose={() => setEntityMediaOpen(false)}
          onApply={async (entity) => {
            commit(replaceEntity(level, selection, entity))
            const manifest = await themeApi.mediaManifest(theme.id)
            await Promise.all(
              manifest.audio
                .filter((entry) => entry.soundId.startsWith('entity-audio-'))
                .map((entry) => audio.loadSound(entry)),
            )
            setEditorManifest(manifest)
            await onThemeChanged()
            setStatus('Selected-object media override applied locally.')
          }}
        />
      )}

      <section className="level-sequence">
        <h2>Campaign sequence</h2>
        <div className="level-sequence__actions">
          <button
            type="button"
            onClick={async () => {
              await themeApi.addLevel(theme.id, level.internalId)
              await onThemeChanged()
            }}
          >
            Duplicate level
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm('Delete this level permanently?')) return
              await themeApi.deleteLevel(theme.id, level.internalId)
              await onThemeChanged()
              onClose()
            }}
          >
            Delete level
          </button>
        </div>
      </section>
    </main>
  )
}

/**
 * Displays registration, login, or the active account summary.
 *
 * @param {object} props Workshop dependencies and navigation callbacks.
 * @returns {import('react').JSX.Element} Theme management screen.
 */
function AccountPanel({ user, onAuthenticated, onLogout, setStatus }) {
  const [mode, setMode] = useState('register')
  const [form, setForm] = useState({ username: '', email: '', password: '' })

  if (user) {
    return (
      <section className="workshop-panel account-panel">
        <div>
          <h2>Your account</h2>
          <p>Signed in as <strong>{user.username}</strong> ({user.email})</p>
        </div>
        <button type="button" onClick={onLogout}>Log out</button>
      </section>
    )
  }

  return (
    <section className="workshop-panel account-panel">
      <h2>{mode === 'register' ? 'Create an account' : 'Log in'}</h2>
      {mode === 'register' && (
        <>
          <label>
            Username
            <input
              autoComplete="username"
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
            />
          </label>
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </label>
        </>
      )}
      {mode === 'login' && (
        <label>
          Username or email
          <input
            autoComplete="username"
            value={form.username}
            onChange={(event) => setForm({ ...form, username: event.target.value })}
          />
        </label>
      )}
      <label>
        Password
        <input
          type="password"
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
        />
      </label>
      <div className="level-sequence__actions">
        <button
          type="button"
          disabled={!form.username.trim() || !form.password}
          onClick={async () => {
            try {
              const result = mode === 'register'
                ? await authApi.register(form)
                : await authApi.login({ login: form.username, password: form.password })
              setStatus('')
              onAuthenticated(result.user)
            } catch (error) {
              setStatus([error.message, ...(error.details ?? [])].join(' '))
            }
          }}
        >
          {mode === 'register' ? 'Register' : 'Log in'}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'register' ? 'login' : 'register')
            setStatus('')
          }}
        >
          {mode === 'register' ? 'I already have an account' : 'Create an account'}
        </button>
      </div>
      {mode === 'register' && (
        <small>Development accounts are active immediately; no email confirmation is sent.</small>
      )}
    </section>
  )
}

/**
 * Lets a theme owner copy validated PublicMedia assets into a theme package.
 *
 * @param {object} props Media-editor properties.
 * @returns {import('react').JSX.Element} Theme media selection panel.
 */
function ThemeMediaEditor({ theme, onChanged }) {
  const [kind, setKind] = useState('image')
  const [targetId, setTargetId] = useState('')
  const targets = kind === 'image' ? mediaDefinitions : soundDefinitions

  /** @param {'image'|'audio'} nextKind Catalog media kind. @returns {void} */
  const changeKind = (nextKind) => {
    setKind(nextKind)
    setTargetId('')
  }

  /** @param {string} assetId Selected PublicMedia asset ID. @returns {Promise<string>} Status. */
  const applySelection = async (assetId) => {
    if (kind === 'image') {
      await themeApi.setVisualMedia(theme.id, targetId, assetId)
    } else {
      await themeApi.setAudioMedia(theme.id, targetId, assetId)
    }
    await onChanged()
    return `Saved ${targetId} in ${theme.name}.`
  }

  return (
    <section className="workshop-panel theme-media-editor">
      <h2>Theme media</h2>
      <p>
        First choose the object you want to replace. Then visually browse the
        read-only PublicMedia folders and choose its new artwork or sound.
      </p>
      <div className="theme-media-editor__controls">
        <label>
          Media type
          <select value={kind} onChange={(event) => changeKind(event.target.value)}>
            <option value="image">Image</option>
            <option value="audio">Audio</option>
          </select>
        </label>
        <label>
          Theme element
          <select
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
          >
            <option value="">Choose an element…</option>
            {targets.map((target) => {
              const id = kind === 'image' ? target.mediaId : target.soundId
              return <option key={id} value={id}>{id}</option>
            })}
          </select>
        </label>
      </div>
      <PublicMediaBrowser
        key={`${kind}-${targetId}`}
        kind={kind}
        enabled={Boolean(targetId)}
        emptyMessage="Choose a theme element above to open the PublicMedia browser."
        actionLabel={`Use selected ${kind}`}
        onApply={applySelection}
      />
    </section>
  )
}

/**
 * Displays public themes and the complete server-backed level workshop.
 *
 * @param {object} props Workshop dependencies and navigation callbacks.
 * @returns {import('react').JSX.Element} Theme management screen.
 */
export default function ThemeWorkshop({
  onPlayTheme,
  audio,
  mediaManifest,
  reducedMotion,
  gameplayConfig,
  powerups,
}) {
  const [themes, setThemes] = useState([])
  const [editableThemes, setEditableThemes] = useState([])
  const [activeTheme, setActiveTheme] = useState(null)
  const [editingLevel, setEditingLevel] = useState(null)
  const [status, setStatus] = useState('Loading themes…')
  const [user, setUser] = useState(undefined)
  const [cloneForm, setCloneForm] = useState({
    sourceThemeId: 'default',
    name: '',
    description: '',
  })
  const activeThemeId = activeTheme?.id

  /** @returns {Promise<void>} Completion of session, theme, and public-list refresh. */
  const refresh = useCallback(async () => {
    try {
      const publicResult = await themeApi.list()
      setThemes(publicResult.themes)
      setEditableThemes(user ? (await themeApi.mine()).themes : [])
      if (activeThemeId) {
        const refreshed = await themeApi.get(activeThemeId)
        setActiveTheme(refreshed)
      }
      setStatus('')
    } catch (error) {
      setStatus(`Theme server unavailable: ${error.message}`)
    }
  }, [activeThemeId, user])

  useEffect(() => {
    authApi.me()
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch((error) => {
        setUser(null)
        setStatus(`Account service unavailable: ${error.message}`)
      })
  }, [])

  useEffect(() => {
    if (user !== undefined) refresh()
  }, [refresh, user])

  if (editingLevel && activeTheme) {
    return (
      <LevelEditor
        theme={activeTheme}
        initialLevel={editingLevel}
        onClose={() => setEditingLevel(null)}
        onThemeChanged={refresh}
        audio={audio}
        mediaManifest={mediaManifest}
        reducedMotion={reducedMotion}
        gameplayConfig={gameplayConfig}
        powerups={powerups}
      />
    )
  }

  if (activeTheme) {
    return (
      <main className="content-screen theme-dashboard">
        <div className="screen-heading">
          <div>
            <p className="eyebrow">Theme Workshop</p>
            <h1>{activeTheme.name}</h1>
            <p>{activeTheme.description}</p>
          </div>
          <button type="button" onClick={() => setActiveTheme(null)}>
            Back to themes
          </button>
        </div>
        <div className="theme-dashboard__actions">
          <button
            type="button"
            onClick={async () => {
              await themeApi.publish(activeTheme.id, !activeTheme.public)
              await refresh()
            }}
          >
            {activeTheme.public ? 'Make private' : 'Publish theme'}
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm('Delete this theme and every level permanently?')) {
                return
              }
              await themeApi.deleteTheme(activeTheme.id)
              setActiveTheme(null)
              await refresh()
            }}
          >
            Delete theme
          </button>
        </div>
        <ThemeMediaEditor theme={activeTheme} onChanged={refresh} />
        <section className="workshop-level-list">
          {activeTheme.levels.map((level, index) => (
            <article key={level.internalId}>
              <span>{level.number}</span>
              <strong>{level.name}</strong>
              <button
                type="button"
                disabled={index === 0}
                onClick={async () => {
                  const order = activeTheme.levels.map((item) => item.internalId)
                  ;[order[index - 1], order[index]] = [
                    order[index],
                    order[index - 1],
                  ]
                  await themeApi.reorder(activeTheme.id, order)
                  await refresh()
                }}
              >
                Move up
              </button>
              <button
                type="button"
                disabled={index === activeTheme.levels.length - 1}
                onClick={async () => {
                  const order = activeTheme.levels.map((item) => item.internalId)
                  ;[order[index + 1], order[index]] = [
                    order[index],
                    order[index + 1],
                  ]
                  await themeApi.reorder(activeTheme.id, order)
                  await refresh()
                }}
              >
                Move down
              </button>
              <button
                type="button"
                onClick={async () => {
                  setEditingLevel(
                    await themeApi.level(activeTheme.id, level.internalId),
                  )
                }}
              >
                Edit level
              </button>
            </article>
          ))}
        </section>
      </main>
    )
  }

  return (
    <main className="content-screen theme-workshop">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">Persistent campaign laboratory</p>
          <h1>Theme Workshop</h1>
          <p>
            Clone a campaign, reshape every level on a 10-unit grid, validate,
            playtest, and publish it.
          </p>
        </div>
      </div>
      {status && <div role="status">{status}</div>}
      {user !== undefined && (
        <AccountPanel
          user={user}
          setStatus={setStatus}
          onAuthenticated={setUser}
          onLogout={async () => {
            await authApi.logout()
            setUser(null)
            setActiveTheme(null)
          }}
        />
      )}

      {user && <section className="workshop-panel">
        <h2>Clone a theme</h2>
        <label>
          Source
          <select
            value={cloneForm.sourceThemeId}
            onChange={(event) =>
              setCloneForm({ ...cloneForm, sourceThemeId: event.target.value })
            }
          >
            {themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name} ({theme.levelCount} levels)
              </option>
            ))}
          </select>
        </label>
        <label>
          Theme name
          <input
            value={cloneForm.name}
            onChange={(event) =>
              setCloneForm({ ...cloneForm, name: event.target.value })
            }
          />
        </label>
        <label>
          Description
          <textarea
            value={cloneForm.description}
            onChange={(event) =>
              setCloneForm({ ...cloneForm, description: event.target.value })
            }
          />
        </label>
        <button
          type="button"
          disabled={!cloneForm.name.trim()}
          onClick={async () => {
            await themeApi.clone(cloneForm)
            setCloneForm({ ...cloneForm, name: '', description: '' })
            await refresh()
          }}
        >
          Clone campaign
        </button>
      </section>}

      <section className="theme-gallery">
        <h2>Published themes</h2>
        {themes.map((theme) => (
          <article key={theme.id}>
            <h3>{theme.name}</h3>
            <p>{theme.description}</p>
            <small>{theme.levelCount} levels</small>
            <button type="button" onClick={() => onPlayTheme(theme.id)}>
              Play theme
            </button>
            <button
              type="button"
              disabled={!user}
              title={user ? 'Clone this campaign' : 'Log in to clone themes'}
              onClick={() =>
                setCloneForm({ ...cloneForm, sourceThemeId: theme.id })
              }
            >
              Clone
            </button>
          </article>
        ))}
      </section>

      <section className="theme-gallery">
        <h2>Your editable themes</h2>
        {!user && <p>Register or log in to create and edit themes.</p>}
        {editableThemes.map((theme) => (
          <article key={theme.id}>
            <h3>{theme.name}</h3>
            <p>{theme.public ? 'Published' : 'Private draft'}</p>
            <button
              type="button"
              onClick={async () => setActiveTheme(await themeApi.get(theme.id))}
            >
              Open editor
            </button>
          </article>
        ))}
      </section>
    </main>
  )
}
