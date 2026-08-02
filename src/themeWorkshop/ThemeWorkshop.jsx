import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameView from '../game/GameView.jsx'
import { mediaDefinitions, soundDefinitions } from '../config/loadConfig.js'
import { generateLevel } from '../game/generation/levelGenerator.js'
import { authApi, mediaLibraryApi, themeApi } from './themeApi.js'

const GRID_SIZE = 10

const ENTITY_GROUPS = [
  'manualObstacles',
  'movingObstacles',
  'trackingObstacles',
  'dynamicObstacles',
  'switches',
  'forceFields',
  'coins',
]

function snap(value) {
  return Math.round(Number(value) / GRID_SIZE) * GRID_SIZE
}

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

function entitySize(entity) {
  if (entity.radius) return { width: entity.radius * 2, height: entity.radius * 2 }
  return {
    width: entity.width ?? entity.size ?? 50,
    height: entity.height ?? entity.size ?? 50,
  }
}

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

function LevelMap({
  level,
  selection,
  onSelect,
  onMove,
  onDragStart,
  onDragEnd,
}) {
  const dragRef = useRef(null)
  const descriptors = entityDescriptors(level)

  const handlePointerMove = (event) => {
    if (!dragRef.current) return
    const bounds = event.currentTarget.getBoundingClientRect()
    onMove(dragRef.current, {
      x: snap(((event.clientX - bounds.left) / bounds.width) * 1600),
      y: snap(((event.clientY - bounds.top) / bounds.height) * 900),
    })
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
      {descriptors.map((descriptor) => {
        const size = entitySize(descriptor.entity)
        const selected =
          selection?.group === descriptor.group &&
          selection?.index === descriptor.index
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
              event.preventDefault()
              dragRef.current = {
                group: descriptor.group,
                index: descriptor.index,
              }
              onDragStart()
              onSelect(dragRef.current)
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onClick={() =>
              onSelect({ group: descriptor.group, index: descriptor.index })
            }
          >
            <span>{descriptor.label}</span>
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

  const parseDraft = () => {
    try {
      return { value: JSON.parse(draft), error: null }
    } catch (error) {
      return { value: null, error: error.message }
    }
  }

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
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const [entityJson, setEntityJson] = useState('')
  const [jsonEditorOpen, setJsonEditorOpen] = useState(false)
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

  const commit = (next) => {
    setUndoStack((items) => [...items.slice(-49), level])
    setRedoStack([])
    setLevel(next)
  }

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
          mediaManifest={mediaManifest}
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
            Drag every entity on the 10-unit grid. Exact snapped coordinates are
            available in the inspector.
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
              <option value="moving">Moving obstacle</option>
              <option value="tracking">Tracking obstacle</option>
              <option value="phase">Phase obstacle</option>
              <option value="pulse">Pulse obstacle</option>
              <option value="orbit">Orbit obstacle</option>
              <option value="rotate">Spinner obstacle</option>
              <option value="switch">Switch pad</option>
              <option value="switchBarrier">Switch barrier</option>
              <option value="conveyor">Conveyor field</option>
              <option value="radial">Radial field</option>
              <option value="coin">Coin</option>
              <option value="bonus">Bonus target</option>
            </select>
          </label>

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
  const [status, setStatus] = useState(
    'Choose a theme element to browse PublicMedia.',
  )
  const targets = kind === 'image' ? mediaDefinitions : soundDefinitions
  const selectedAsset = catalog.items.find((item) => item.id === selectedAssetId)

  const loadCatalog = useCallback(async () => {
    if (!targetId) return
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
  }, [folder, kind, offset, query, targetId])

  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  const changeKind = (nextKind) => {
    setKind(nextKind)
    setTargetId('')
    setFolder('')
    setQuery('')
    setSelectedAssetId('')
    setStatus('Choose a theme element to browse PublicMedia.')
    setOffset(0)
  }

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

  const applySelection = async () => {
    if (!selectedAssetId) return
    try {
      setStatus(
        kind === 'audio'
          ? 'Normalizing WAV and generating WebM/MP3…'
          : 'Copying image into the theme…',
      )
      if (kind === 'image') {
        await themeApi.setVisualMedia(theme.id, targetId, selectedAssetId)
      } else {
        await themeApi.setAudioMedia(theme.id, targetId, selectedAssetId)
      }
      setStatus(`Saved ${targetId} in ${theme.name}.`)
      await onChanged()
    } catch (error) {
      setStatus(error.message)
    }
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
            onChange={(event) => {
              setTargetId(event.target.value)
              setFolder('')
              setSelectedAssetId('')
              setOffset(0)
            }}
          >
            <option value="">Choose an element…</option>
            {targets.map((target) => {
              const id = kind === 'image' ? target.mediaId : target.soundId
              return <option key={id} value={id}>{id}</option>
            })}
          </select>
        </label>
      </div>
      {!targetId && (
        <div className="theme-media-editor__empty">
          Choose a theme element above to open the PublicMedia browser.
        </div>
      )}
      {targetId && (
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
                <span>▸ {item.id}</span>
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
      )}
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
          </div>
        </section>
      )}
      {targetId && <div className="theme-media-editor__actions">
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
          Use selected {kind}
        </button>
      </div>}
      <div role="status">{status}</div>
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
