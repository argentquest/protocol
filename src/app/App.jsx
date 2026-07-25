import { useEffect, useMemo, useRef, useState } from 'react'
import {
  activeTheme,
  configurationStatus,
  gameplayConfig,
  levels as levelConfigs,
  powerups,
} from '../config/loadConfig.js'
import GameView from '../game/GameView.jsx'
import { createAudioManager } from '../game/audio/audioManager.js'
import { recordPlaytestRun } from '../game/debug/playtestLog.js'
import { generateLevel } from '../game/generation/levelGenerator.js'
import { loadStartupMedia } from '../game/media/startupLoader.js'
import { sharedVectorAssetCache } from '../game/rendering/pixi/VectorAssetCache.js'
import {
  cumulativeScore,
  collectCourseCoin,
  consumePowerup,
  loadProgress,
  purchasePowerup,
  recordFailedAttempt,
  recordLevelResult,
  resetProgress,
  saveProgress,
} from '../persistence/progressStore.js'

function ProtocolMark({ compact = false }) {
  return (
    <div className={`protocol-mark ${compact ? 'protocol-mark--compact' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <path d="M12 12h40v40H12z" />
        <path d="M20 43 31 20l5 13 8-12" />
        <circle cx="20" cy="43" r="3" />
        <circle cx="44" cy="21" r="3" />
      </svg>
    </div>
  )
}

function StartupScreen({ startup, onStart, onRetry }) {
  const ready = startup.status === 'ready'
  const failed = startup.status === 'error'
  return (
    <main className="startup-screen" aria-live="polite">
      <ProtocolMark />
      <p className="eyebrow">Path Protocol // Future Lab</p>
      <h1>Starting up the game</h1>
      <p>
        {failed
          ? 'The laboratory media could not be initialized.'
          : ready
            ? 'All systems are ready. Start the game to enable sound.'
            : startup.label}
      </p>
      {!failed && (
        <>
          <progress
            aria-label="Startup progress"
            max="100"
            value={startup.percentage}
          />
          <b>{startup.percentage}%</b>
        </>
      )}
      {failed && <div role="alert">{startup.error}</div>}
      {ready && (
        <button className="primary-button" type="button" onClick={onStart}>
          Start Game
        </button>
      )}
      {failed && (
        <button className="primary-button" type="button" onClick={onRetry}>
          Retry startup
        </button>
      )}
    </main>
  )
}

function ShellHeader({
  onHome,
  onLevels,
  onPowers,
  onInstructions,
  onSettings,
  score,
  coins,
  devMode,
}) {
  return (
    <header className="shell-header">
      <button className="brand-button" type="button" onClick={onHome}>
        <ProtocolMark compact />
        <span>
          <strong>PATH</strong> PROTOCOL
        </span>
      </button>
      <nav aria-label="Primary navigation">
        <button type="button" onClick={onLevels}>
          Protocols
        </button>
        <button type="button" onClick={onPowers}>
          Power lab
        </button>
        <button type="button" onClick={onInstructions}>
          Field guide
        </button>
        <button type="button" onClick={onSettings}>
          Controls
        </button>
      </nav>
      {devMode && <span className="dev-mode-badge">DEV PLAYTEST</span>}
      <div className="total-score">
        <span>Total score</span>
        <strong>{score.toLocaleString()}</strong>
        <small>{coins.toLocaleString()} coins</small>
      </div>
    </header>
  )
}

function HomeScreen({
  progress,
  totalScore,
  onPlay,
  onLevels,
  onPowers,
  onInstructions,
  devMode,
  onToggleDevMode,
}) {
  const completedCount = Object.values(progress.levels).filter((level) => level.completed).length
  const hasProgress = completedCount > 0

  return (
    <main className="home-screen">
      <section className="hero-copy">
        {devMode && (
          <div className="dev-banner">
            Developer playtest is active. All chambers are unlocked and player progress is isolated.
          </div>
        )}
        <p className="eyebrow">
          <span className="live-pip" />
          Precision systems online
        </p>
        <h1>
          Find the line.
          <span>Hold your nerve.</span>
        </h1>
        <p className="hero-summary">
          Guide a live protocol token through generated hazard chambers. Every extra
          movement costs efficiency. Every contact costs 20%.
        </p>
        <div className="hero-actions">
          <button className="primary-button" type="button" onClick={onPlay}>
            <span>{hasProgress ? 'Continue protocol' : 'Begin calibration'}</span>
            <b aria-hidden="true">→</b>
          </button>
          <button className="secondary-button" type="button" onClick={onLevels}>
            Select level
          </button>
          <button className="secondary-button" type="button" onClick={onPowers}>
            Buy power-ups · {progress.player.coins} coins
          </button>
          <button
            className="secondary-button dev-mode-toggle"
            type="button"
            aria-label="Dev mode"
            aria-pressed={devMode}
            onClick={onToggleDevMode}
          >
            Dev mode <b>{devMode ? 'ON' : 'OFF'}</b>
          </button>
        </div>
        <button className="text-button" type="button" onClick={onInstructions}>
          How the protocol works <span aria-hidden="true">↗</span>
        </button>
      </section>

      <section className="hero-visual" aria-label="Path Protocol chamber preview">
        <div className="hero-frame">
          <div className="hero-frame__header">
            <span>CHAMBER PREVIEW</span>
            <span className="system-state">SYSTEM NOMINAL</span>
          </div>
          <svg viewBox="0 0 700 700" role="img" aria-label="A token path around laboratory hazards">
            <defs>
              <pattern id="hero-grid" width="35" height="35" patternUnits="userSpaceOnUse">
                <path d="M35 0H0V35" className="hero-grid-line" />
              </pattern>
              <filter id="hero-glow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="9" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path
              className="hero-arena"
              d="M73 104 221 55 542 75 640 190 617 543 506 628 161 615 57 474Z"
            />
            <path
              className="hero-arena-grid"
              d="M73 104 221 55 542 75 640 190 617 543 506 628 161 615 57 474Z"
              fill="url(#hero-grid)"
            />
            <g className="hero-hazards">
              <rect x="221" y="191" width="72" height="198" rx="11" />
              <circle cx="444" cy="281" r="53" />
              <rect x="355" y="444" width="189" height="54" rx="10" />
              <path d="m166 430 51-51 51 51-51 51Z" />
            </g>
            <path
              className="hero-route"
              d="M141 516C151 474 132 404 169 351c42-61 91-86 146-78 63 9 35 103 89 118 58 16 118-39 155-102"
            />
            <g className="hero-token" transform="translate(141 516)" filter="url(#hero-glow)">
              <circle r="22" />
              <circle r="6" />
            </g>
            <g className="hero-target" transform="translate(559 289)">
              <circle r="28" />
              <circle r="42" />
            </g>
          </svg>
          <div className="hero-frame__footer">
            <span>INPUT // HOLD + DRAG</span>
            <span>VECTOR LOCKED</span>
          </div>
        </div>
        <div className="hero-stat hero-stat--score">
          <span>Current record</span>
          <strong>{totalScore.toLocaleString()}</strong>
          <small>{completedCount}/{levelConfigs.length} protocols complete</small>
        </div>
        <div className="hero-stat hero-stat--efficiency">
          <span>Scoring model</span>
          <strong>50 / 50</strong>
          <small>Time × route efficiency</small>
        </div>
      </section>
    </main>
  )
}

function LevelSelect({ levels, progress, onSelect, onPowers, devMode }) {
  return (
    <main className="content-screen">
      <div className="screen-heading">
        <p className="eyebrow">Protocol archive</p>
        <h1>Select a chamber</h1>
        <p>Each level uses a shared deterministic seed. Replay any cleared chamber to improve its score.</p>
        <div className="screen-heading__actions">
          <button className="secondary-button" type="button" onClick={onPowers}>
            Buy power-ups · {progress.player.coins} coins
          </button>
        </div>
      </div>
      <section className="level-grid" aria-label="Available levels">
        {levels.map((level) => {
          const unlocked = devMode || level.number <= progress.player.highestUnlockedLevel
          const record = progress.levels[level.id]
          return (
            <button
              key={level.id}
              className={`level-card ${
                record?.completed ? 'is-complete' : ''
              } ${level.difficulty === 15 ? 'is-apex' : ''}`}
              type="button"
              disabled={!unlocked}
              onClick={() => onSelect(level.id)}
            >
              <div className="level-card__top">
                <span className="level-number">{String(level.number).padStart(2, '0')}</span>
                <span className="level-state">
                  {devMode
                    ? 'PLAYTEST'
                    : !unlocked
                      ? 'LOCKED'
                      : record?.completed
                        ? 'CLEARED'
                        : 'AVAILABLE'}
                </span>
              </div>
              <div>
                <h2>{level.name}</h2>
                <p>{level.briefing}</p>
              </div>
              <div className="level-card__meta">
                <span>
                  Difficulty{' '}
                  <b>
                    {level.difficulty === 15
                      ? '15 · APEX'
                      : `${level.difficulty}/10`}
                  </b>
                </span>
                <span>
                  Best <b>{(record?.bestScore ?? 0).toLocaleString()}</b>
                </span>
              </div>
              <div className="difficulty-bar">
                <i
                  style={{
                    width: `${Math.min(100, level.difficulty * 10)}%`,
                  }}
                />
              </div>
            </button>
          )
        })}
      </section>
    </main>
  )
}

function PowerLab({ progress, totalScore, onPurchase }) {
  return (
    <main className="content-screen">
      <div className="screen-heading">
        <p className="eyebrow">Power laboratory</p>
        <h1>Convert coins into powers</h1>
        <p>
          Powers unlock through cumulative score. Each purchased charge is permanently consumed
          when activated with its number key.
        </p>
      </div>
      <div className="power-lab-summary">
        <span>Available currency</span>
        <strong>{progress.player.coins.toLocaleString()} coins</strong>
        <small>{totalScore.toLocaleString()} cumulative score</small>
      </div>
      <section className="power-grid" aria-label="Available power-ups">
        {powerups.map((powerup) => {
          const unlocked = totalScore >= powerup.unlockScore
          const owned = Number(progress.player.inventory[powerup.id]) || 0
          const affordable = progress.player.coins >= powerup.coinCost
          return (
            <article
              className={`power-card ${unlocked ? 'is-unlocked' : ''}`}
              key={powerup.id}
            >
              <div className="power-card__key">
                {powerup.key}
              </div>
              <div>
                <p className="eyebrow">{unlocked ? 'Power online' : 'Power encrypted'}</p>
                <h2>{powerup.name}</h2>
                <p>{powerup.description}</p>
              </div>
              <dl>
                <div>
                  <dt>Owned</dt>
                  <dd>{owned}</dd>
                </div>
                <div>
                  <dt>Cost</dt>
                  <dd>{powerup.coinCost} coins</dd>
                </div>
                <div>
                  <dt>Unlock</dt>
                  <dd>{powerup.unlockScore.toLocaleString()} score</dd>
                </div>
              </dl>
              <button
                className="secondary-button"
                type="button"
                disabled={!unlocked || !affordable}
                onClick={() => onPurchase(powerup)}
              >
                {!unlocked ? 'Score locked' : affordable ? 'Purchase charge' : 'Need more coins'}
              </button>
            </article>
          )
        })}
      </section>
    </main>
  )
}

function Instructions() {
  return (
    <main className="content-screen guide-screen">
      <div className="screen-heading">
        <p className="eyebrow">Operator field guide</p>
        <h1>One route. No shortcuts.</h1>
        <p>Your mouse or the arrow keys control the center of a physical token. Its complete outline must clear the chamber.</p>
      </div>
      <section className="guide-grid">
        <article>
          <span className="guide-index">01</span>
          <div className="guide-icon guide-icon--token"><i /></div>
          <h2>Click to toggle</h2>
          <p>Click the glowing token to start mouse control and click again to stop, or press Space to toggle keyboard control and steer with the arrow keys.</p>
        </article>
        <article>
          <span className="guide-index">02</span>
          <div className="guide-icon guide-icon--route"><i /></div>
          <h2>Clear every edge</h2>
          <p>The token has real dimensions. Touch a wall or hazard and you lose 20% while the clock keeps running.</p>
        </article>
        <article>
          <span className="guide-index">03</span>
          <div className="guide-icon guide-icon--target"><i /></div>
          <h2>Touch the target</h2>
          <p>Any token contact activates it. A relay popup lets you bank or begin a new bonus run from that checkpoint.</p>
        </article>
        <article>
          <span className="guide-index">04</span>
          <div className="guide-icon guide-icon--score"><i /></div>
          <h2>Optimize the vector</h2>
          <p>Half your score comes from time and half from travel efficiency. The direct line is your benchmark.</p>
        </article>
        <article>
          <span className="guide-index">05</span>
          <div className="guide-icon guide-icon--route"><i /></div>
          <h2>Break pursuit</h2>
          <p>Red tracking hazards wake after your first press, accelerate gradually, and steer within their marked sector.</p>
        </article>
        <article>
          <span className="guide-index">06</span>
          <div className="guide-icon guide-icon--score"><i /></div>
          <h2>Collect and power up</h2>
          <p>Touch one-time coins, purchase charges in the Power Lab, and activate them anytime with number keys 1–5.</p>
        </article>
      </section>
      <div className="guide-callout">
        <strong>Three contacts reset the chamber.</strong>
        <span>The generated layout stays unchanged, and your previous route remains as a ghost trail.</span>
      </div>
    </main>
  )
}

function Settings({ settings, onChange, onReset }) {
  const update = (key, value) => onChange({ ...settings, [key]: value })
  return (
    <main className="content-screen settings-screen">
      <div className="screen-heading">
        <p className="eyebrow">System controls</p>
        <h1>Operator settings</h1>
        <p>Audio channels and motion preferences are stored only in this browser.</p>
      </div>
      <section className="settings-panel">
        <div className="setting-row">
          <div>
            <strong>Ambient music</strong>
            <span>Procedural low-frequency laboratory soundscape</span>
          </div>
          <button
            className={`toggle ${settings.musicEnabled ? 'is-on' : ''}`}
            type="button"
            role="switch"
            aria-label="Ambient music"
            aria-checked={settings.musicEnabled}
            onClick={() => update('musicEnabled', !settings.musicEnabled)}
          >
            <i />
          </button>
        </div>
        <label className="setting-row setting-row--slider">
          <div>
            <strong>Music volume</strong>
            <span>{Math.round(settings.musicVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings.musicVolume}
            onChange={(event) => update('musicVolume', Number(event.target.value))}
          />
        </label>
        <div className="setting-row">
          <div>
            <strong>Sound effects</strong>
            <span>Hazard, target, relay, and completion feedback</span>
          </div>
          <button
            className={`toggle ${settings.effectsEnabled ? 'is-on' : ''}`}
            type="button"
            role="switch"
            aria-label="Sound effects"
            aria-checked={settings.effectsEnabled}
            onClick={() => update('effectsEnabled', !settings.effectsEnabled)}
          >
            <i />
          </button>
        </div>
        <label className="setting-row setting-row--slider">
          <div>
            <strong>Effects volume</strong>
            <span>{Math.round(settings.effectsVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings.effectsVolume}
            onChange={(event) => update('effectsVolume', Number(event.target.value))}
          />
        </label>
        <div className="setting-row">
          <div>
            <strong>Reduced motion</strong>
            <span>Minimize pulses, scan effects, and interface movement</span>
          </div>
          <button
            className={`toggle ${settings.reducedMotion ? 'is-on' : ''}`}
            type="button"
            role="switch"
            aria-label="Reduced motion"
            aria-checked={settings.reducedMotion}
            onClick={() => update('reducedMotion', !settings.reducedMotion)}
          >
            <i />
          </button>
        </div>
        <div className="danger-zone">
          <div>
            <strong>Reset local progress</strong>
            <span>Clear all level records, unlocks, and settings from this browser.</span>
          </div>
          <button type="button" onClick={onReset}>
            Reset progress
          </button>
        </div>
      </section>
    </main>
  )
}

function Results({
  level,
  result,
  improved,
  cumulative,
  onReplay,
  onNext,
  onLevels,
  devMode,
}) {
  const efficiency = Math.round(result.routeFactor * 100)
  const timeRating = Math.round(result.timeFactor * 100)
  return (
    <main className="results-screen">
      <div className="results-orbit" aria-hidden="true">
        <span />
        <i />
      </div>
      <p className="eyebrow">Protocol {String(level.number).padStart(2, '0')} complete</p>
      <h1>{devMode ? 'Playtest run captured' : improved ? 'New chamber record' : 'Vector secured'}</h1>
      <div className="results-score">
        <strong>{result.finalScore.toLocaleString()}</strong>
        <span>/ {result.attainableMaximum.toLocaleString()}</span>
      </div>
      <div className="results-metrics">
        <div>
          <span>Time</span>
          <strong>{(result.elapsedMs / 1000).toFixed(2)}s</strong>
          <small>{timeRating}% of par score</small>
        </div>
        <div>
          <span>Route efficiency</span>
          <strong>{efficiency}%</strong>
          <small>{Math.round(result.actualDistance)} units traveled</small>
        </div>
        <div>
          <span>Hazard contacts</span>
          <strong>{result.collisions}</strong>
          <small>-{Math.round(result.collisionPenalty).toLocaleString()} points</small>
        </div>
        <div>
          <span>Bonus relays</span>
          <strong>{result.earnedBonuses}</strong>
          <small>
            {result.coinsEarned
              ? `+${result.coinsEarned} reward coins`
              : `Total score ${cumulative.toLocaleString()}`}
          </small>
        </div>
      </div>
      <div className="results-actions">
        {level.number < levelConfigs.length && (
          <button className="primary-button" type="button" onClick={onNext}>
            <span>Next protocol</span>
            <b aria-hidden="true">→</b>
          </button>
        )}
        <button className="secondary-button" type="button" onClick={onReplay}>
          Replay level
        </button>
        <button className="text-button" type="button" onClick={onLevels}>
          Protocol archive
        </button>
      </div>
    </main>
  )
}

/**
 * Resolves playtest mode from an explicit URL override, otherwise enabling it
 * by default on the local Vite development server.
 *
 * @returns {boolean} Whether isolated developer playtesting is active.
 */
function initialDevMode() {
  const override = new URLSearchParams(window.location.search).get('dev')
  if (override !== null) return override === '1'
  return import.meta.env.DEV
}

function PathProtocolApp() {
  const [devMode, setDevMode] = useState(initialDevMode)
  const [progress, setProgress] = useState(() => loadProgress())
  const [screen, setScreen] = useState('home')
  const [selectedLevelId, setSelectedLevelId] = useState('level-01')
  const [lastResult, setLastResult] = useState(null)
  const [mediaManifest, setMediaManifest] = useState(null)
  const [startupAttempt, setStartupAttempt] = useState(0)
  const [startup, setStartup] = useState({
    status: 'loading',
    label: 'Validating configuration',
    percentage: 0,
    error: null,
  })
  const [started, setStarted] = useState(false)
  const selectedConfig =
    levelConfigs.find((level) => level.id === selectedLevelId) ?? levelConfigs[0]
  const currentLevel = useMemo(() => generateLevel(selectedConfig), [selectedConfig])
  const totalScore = cumulativeScore(progress)
  const audioRef = useRef(null)
  const audioLifecycleRef = useRef(null)
  const progressRef = useRef(progress)
  progressRef.current = progress

  if (!audioRef.current) {
    audioRef.current = createAudioManager(progress.settings)
  }

  useEffect(() => {
    let cancelled = false
    setStartup({
      status: 'loading',
      label: 'Validating configuration',
      percentage: 0,
      error: null,
    })
    loadStartupMedia({
      themeName: 'future-lab',
      validateConfiguration: async () => {
        if (!configurationStatus.valid) {
          throw new Error(configurationStatus.errors.join('; '))
        }
      },
      fetchManifest: async (url) => {
        const response = await fetch(url)
        if (!response.ok) throw new Error('Unable to resolve the Future Lab media.')
        return response.json()
      },
      loadVisual: (entry) => sharedVectorAssetCache.load(entry),
      loadAudio: (entry) => audioRef.current.loadSound(entry),
      onProgress: (snapshot) => {
        if (!cancelled) setStartup({ status: 'loading', error: null, ...snapshot })
      },
    })
      .then((manifest) => {
        if (cancelled) return
        setMediaManifest(manifest)
        setStartup({
          status: 'ready',
          label: 'All systems ready',
          percentage: 100,
          error: null,
        })
      })
      .catch((error) => {
        if (!cancelled) {
          setStartup({
            status: 'error',
            label: 'Startup failed',
            percentage: 0,
            error: error.message,
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [startupAttempt])

  useEffect(() => {
    audioRef.current.updateSettings(progress.settings)
    document.documentElement.dataset.reducedMotion = String(progress.settings.reducedMotion)
  }, [progress.settings])

  useEffect(() => {
    const lifecycle = {}
    audioLifecycleRef.current = lifecycle
    return () => {
      queueMicrotask(() => {
        if (audioLifecycleRef.current === lifecycle) audioRef.current?.dispose()
      })
    }
  }, [])

  const navigate = (nextScreen) => {
    setScreen(nextScreen)
  }

  const toggleDevMode = () => {
    setDevMode((current) => {
      const next = !current
      const url = new URL(window.location.href)
      url.searchParams.set('dev', next ? '1' : '0')
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      )
      return next
    })
  }

  const playLevel = (levelId) => {
    setSelectedLevelId(levelId)
    setLastResult(null)
    navigate('game')
  }

  const continuePlay = () => {
    const nextNumber = Math.min(progress.player.highestUnlockedLevel, levelConfigs.length)
    playLevel(`level-${String(nextNumber).padStart(2, '0')}`)
  }

  const handleComplete = (result) => {
    if (devMode) {
      recordPlaytestRun(currentLevel, result)
      setLastResult({ result, improved: false, level: currentLevel })
      setScreen('results')
      return
    }
    const coinsBefore = progressRef.current.player.coins
    const recorded = recordLevelResult(progressRef.current, currentLevel, result)
    const recordedResult = {
      ...result,
      coinsEarned: recorded.progress.player.coins - coinsBefore,
    }
    progressRef.current = recorded.progress
    saveProgress(recorded.progress)
    setProgress(recorded.progress)
    setLastResult({ result: recordedResult, improved: recorded.improved, level: currentLevel })
    setScreen('results')
  }

  const handleFailedAttempt = () => {
    if (devMode) return
    setProgress((current) => {
      const updated = recordFailedAttempt(current, currentLevel.id)
      saveProgress(updated)
      return updated
    })
  }

  const handleSettings = (settings) => {
    const updated = { ...progress, settings }
    setProgress(updated)
    saveProgress(updated)
    audioRef.current.updateSettings(settings)
  }

  const handlePurchasePowerup = (powerup) => {
    const purchased = purchasePowerup(progressRef.current, powerup)
    if (!purchased.purchased) return
    progressRef.current = purchased.progress
    setProgress(purchased.progress)
    saveProgress(purchased.progress)
    audioRef.current.play(powerup.soundId)
  }

  const handleUsePowerup = (powerupId) => {
    if (devMode) return true
    const consumed = consumePowerup(progressRef.current, powerupId)
    if (!consumed.consumed) return false
    progressRef.current = consumed.progress
    setProgress(consumed.progress)
    saveProgress(consumed.progress)
    return true
  }

  const handleCoinCollected = (coin) => {
    if (devMode) return true
    const collection = collectCourseCoin(progressRef.current, currentLevel.id, coin)
    if (!collection.collected) return false
    progressRef.current = collection.progress
    setProgress(collection.progress)
    saveProgress(collection.progress)
    return true
  }

  const handleReset = () => {
    if (!window.confirm('Reset every local score, unlock, and setting? This cannot be undone.')) return
    const initial = resetProgress()
    setProgress(initial)
    audioRef.current.updateSettings(initial.settings)
    setScreen('home')
  }

  const nextLevel = () => {
    const nextNumber = Math.min(levelConfigs.length, currentLevel.number + 1)
    playLevel(`level-${String(nextNumber).padStart(2, '0')}`)
  }

  const previousLevel = () => {
    const previousNumber = Math.max(1, currentLevel.number - 1)
    playLevel(`level-${String(previousNumber).padStart(2, '0')}`)
  }

  const showShell = screen !== 'game'

  if (!started) {
    return (
      <StartupScreen
        startup={startup}
        onStart={async () => {
          await audioRef.current.unlock()
          setStarted(true)
        }}
        onRetry={() => setStartupAttempt((attempt) => attempt + 1)}
      />
    )
  }

  return (
    <div
      className={`app-shell ${progress.settings.reducedMotion ? 'reduce-motion' : ''}`}
      style={{
        '--color-bg': activeTheme.colors.background,
        '--color-panel': activeTheme.colors.panel,
        '--color-token': activeTheme.colors.token,
        '--color-target': activeTheme.colors.mainTarget,
        '--color-bonus': activeTheme.colors.bonusTarget,
        '--color-hazard': activeTheme.colors.hazard,
        '--color-danger': activeTheme.colors.danger,
      }}
    >
      <div className="ambient-grid" aria-hidden="true" />
      {showShell && (
        <ShellHeader
          score={totalScore}
          coins={progress.player.coins}
          onHome={() => navigate('home')}
          onLevels={() => navigate('levels')}
          onPowers={() => navigate('powers')}
          onInstructions={() => navigate('instructions')}
          onSettings={() => navigate('settings')}
          devMode={devMode}
        />
      )}

      {screen === 'home' && (
        <HomeScreen
          progress={progress}
          totalScore={totalScore}
          onPlay={continuePlay}
          onLevels={() => navigate('levels')}
          onPowers={() => navigate('powers')}
          onInstructions={() => navigate('instructions')}
          devMode={devMode}
          onToggleDevMode={toggleDevMode}
        />
      )}
      {screen === 'levels' && (
        <LevelSelect
          levels={levelConfigs}
          progress={progress}
          onSelect={playLevel}
          onPowers={() => navigate('powers')}
          devMode={devMode}
        />
      )}
      {screen === 'powers' && (
        <PowerLab
          progress={progress}
          totalScore={totalScore}
          onPurchase={handlePurchasePowerup}
        />
      )}
      {screen === 'instructions' && <Instructions />}
      {screen === 'settings' && (
        <Settings
          settings={progress.settings}
          onChange={handleSettings}
          onReset={handleReset}
        />
      )}
      {screen === 'game' && (
        <GameView
          key={currentLevel.id}
          level={currentLevel}
          levelBest={progress.levels[currentLevel.id]?.bestScore ?? 0}
          cumulative={totalScore}
          audio={audioRef.current}
          onComplete={handleComplete}
          onAttemptFailed={handleFailedAttempt}
          onExit={() => navigate('levels')}
          devMode={devMode}
          onPreviousLevel={previousLevel}
          onNextLevel={nextLevel}
          totalLevels={levelConfigs.length}
          powerups={powerups}
          inventory={progress.player.inventory}
          collectedCoins={progress.player.collectedCoins}
          onUsePowerup={handleUsePowerup}
          onCoinCollected={handleCoinCollected}
          mediaManifest={mediaManifest}
          reducedMotion={progress.settings.reducedMotion}
          tokenCollisionTolerance={
            gameplayConfig.collision.tokenToleranceUnits
          }
          collisionGuideStyle={{
            color: Number.parseInt(
              activeTheme.colors.collisionGuide.slice(1),
              16,
            ),
            width: activeTheme.effects.collisionGuideWidth,
          }}
          pointerResponsePerSecond={gameplayConfig.input.pointerResponsePerSecond}
          keyboardSpeedUnitsPerSecond={
            gameplayConfig.input.keyboardSpeedUnitsPerSecond
          }
        />
      )}
      {screen === 'results' && lastResult && (
        <Results
          level={lastResult.level}
          result={lastResult.result}
          improved={lastResult.improved}
          cumulative={totalScore}
          onReplay={() => playLevel(lastResult.level.id)}
          onNext={nextLevel}
          onLevels={() => navigate('levels')}
          devMode={devMode}
        />
      )}

      {showShell && (
        <footer className="shell-footer">
          <span>PATH PROTOCOL // LOCAL BUILD 0.1</span>
          <span>DESKTOP INPUT REQUIRED</span>
        </footer>
      )}
    </div>
  )
}

export function ConfigurationErrorScreen({ errors }) {
  return (
    <main className="configuration-error" role="alert">
      <p className="eyebrow">Startup validation failed</p>
      <h1>Path Protocol could not initialize</h1>
      <p>The local game configuration is incomplete or invalid.</p>
      {import.meta.env.DEV && (
        <ul>
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default function App() {
  if (!configurationStatus.valid) {
    return <ConfigurationErrorScreen errors={configurationStatus.errors} />
  }
  return <PathProtocolApp />
}
