import { useEffect, useMemo, useRef, useState } from 'react'
import AnalyticsConsent from '../analytics/AnalyticsConsent.jsx'
import {
  configuredThemeName,
  configurationStatus,
  gameplayConfig,
  levels as levelConfigs,
  microProtocols,
  powerups,
  themeDefinitions,
} from '../config/loadConfig.js'
import GameView from '../game/GameView.jsx'
import ThemeWorkshop from '../themeWorkshop/ThemeWorkshop.jsx'
import { themeApi } from '../themeWorkshop/themeApi.js'
import About from './About.jsx'
import { createAudioManager } from '../game/audio/audioManager.js'
import { recordPlaytestRun } from '../game/debug/playtestLog.js'
import { generateLevel } from '../game/generation/levelGenerator.js'
import { loadStartupMedia } from '../game/media/startupLoader.js'
import {
  cumulativeScore,
  cumulativeShots,
  collectCourseCoin,
  consumePowerup,
  loadProgress,
  purchasePowerup,
  recordFailedAttempt,
  recordLevelResult,
  recordMicroProtocolResult,
  resetProgress,
  saveProgress,
} from '../persistence/progressStore.js'
import { levelForControlMode } from './controlMode.js'

const PRESENTATION_THEME_KEY = 'path-protocol.presentation-theme'
const CAMPAIGN_THEME_KEY = 'path-protocol.campaign-theme'

/**
 * Reads the last selected presentation theme from browser storage.
 *
 * @returns {string} Configured theme ID, defaulting safely to `default`.
 */
function initialPresentationTheme() {
  const stored = window.localStorage.getItem(PRESENTATION_THEME_KEY)
  return Object.hasOwn(themeDefinitions, stored) ? stored : configuredThemeName
}

/**
 * Renders the Path Protocol brand mark at full or compact size.
 *
 * @param {{compact?: boolean}} props Component props.
 * @returns {import('react').JSX.Element} Brand artwork.
 */
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

/**
 * Presents media-loading progress, startup failures, and the audio-unlocking start action.
 *
 * @param {object} props Component props.
 * @param {object} props.startup Current startup status and progress.
 * @param {() => void} props.onStart Starts the application after media is ready.
 * @param {() => void} props.onRetry Retries failed startup work.
 * @returns {import('react').JSX.Element} Startup screen.
 */
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

/**
 * Lets a first-time visitor choose any currently published campaign before
 * entering the game shell.
 *
 * @param {object} props Public theme selection state.
 * @returns {import('react').JSX.Element} First-visit theme chooser.
 */
function PublicThemeChooser({ themes, loading, error, onSelect }) {
  return (
    <main className="public-theme-chooser">
      <ProtocolMark />
      <p className="eyebrow">Choose your first campaign</p>
      <h1>Pick a public theme</h1>
      <p>
        Every published community theme is available without an account. You
        can switch campaigns again later from Theme Workshop.
      </p>
      {loading && <p role="status">Loading public themes…</p>}
      {error && <p role="alert">{error} The Default campaign is still available.</p>}
      <section className="public-theme-chooser__grid" aria-label="Public themes">
        {themes.map((theme) => (
          <article key={theme.id}>
            <p className="eyebrow">{theme.levelCount} levels</p>
            <h2>{theme.name}</h2>
            <p>{theme.description}</p>
            <button
              className="primary-button"
              type="button"
              onClick={() => onSelect(theme.id)}
            >
              Play {theme.name}
            </button>
          </article>
        ))}
      </section>
    </main>
  )
}

/**
 * Renders persistent application navigation and score context.
 *
 * @param {object} props Navigation state and callbacks.
 * @returns {import('react').JSX.Element} Application header.
 */
function ShellHeader({
  onHome,
  onLevels,
  onPowers,
  onInstructions,
  onAbout,
  onSettings,
  onWorkshop,
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
        <button type="button" onClick={onAbout}>
          About
        </button>
        <button type="button" onClick={onSettings}>
          Controls
        </button>
        <button type="button" onClick={onWorkshop}>
          Theme workshop
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

/**
 * Renders the campaign landing screen and current progression summary.
 *
 * @param {object} props Progress, theme, and navigation callbacks.
 * @returns {import('react').JSX.Element} Home screen.
 */
function HomeScreen({
  progress,
  totalScore,
  onPlay,
  onLevels,
  onPowers,
  onInstructions,
  devMode,
  onToggleDevMode,
  totalLevels,
  controlMode,
  onControlModeChange,
  campaignShots,
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
        <div className="home-mode-selector" role="group" aria-label="Movement mode">
          <span>Movement mode</span>
          <button
            type="button"
            aria-pressed={controlMode === 'guided'}
            onClick={() => onControlModeChange('guided')}
          >
            Guided
          </button>
          <button
            type="button"
            aria-pressed={controlMode === 'kinetic'}
            onClick={() => onControlModeChange('kinetic')}
          >
            Ricochet
          </button>
          <small>
            {controlMode === 'kinetic'
              ? `${campaignShots} campaign-best · ${progress.player.totalShotsLaunched} completed-run shots`
              : 'Original continuous steering'}
          </small>
        </div>
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
            <span>
              {controlMode === 'kinetic'
                ? 'INPUT // AIM + LAUNCH'
                : 'INPUT // HOLD + DRAG'}
            </span>
            <span>VECTOR LOCKED</span>
          </div>
        </div>
        <div className="hero-stat hero-stat--score">
          <span>Current record</span>
          <strong>{totalScore.toLocaleString()}</strong>
          <small>{completedCount}/{totalLevels} protocols complete</small>
        </div>
        <div className="hero-stat hero-stat--efficiency">
          <span>Scoring model</span>
          <strong>50 / 50</strong>
          <small>Time × route efficiency</small>
        </div>
      </section>
      <footer className="project-attribution">
        <span>
          Path Protocol is open-source software under the{' '}
          <a
            href="https://github.com/argentquest/protocol/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer"
          >
            MIT License
          </a>
          .
        </span>
        <span>
          Developed by{' '}
          <a
            href="https://www.linkedin.com/in/eric-silver-tx/"
            target="_blank"
            rel="noreferrer"
          >
            Eric Silver
          </a>{' '}
          of ArgentQuest ·{' '}
          <a href="mailto:esilver@argentquest.com">esilver@argentquest.com</a>
        </span>
        <span>
          <a
            href="https://app.inkandquill.io/protocol/"
            target="_blank"
            rel="noreferrer"
          >
            Play the hosted game
          </a>{' '}
          · Complimentary hosting provided by ArgentQuest ·{' '}
          <a href={`${import.meta.env.BASE_URL}PRIVACY.html`}>Privacy</a>
        </span>
      </footer>
    </main>
  )
}

/**
 * Renders campaign levels with unlock, completion, and apex status.
 *
 * @param {object} props Campaign selection state and callbacks.
 * @returns {import('react').JSX.Element} Level-selection screen.
 */
function LevelSelect({
  levels,
  progress,
  onSelect,
  onPowers,
  devMode,
  themeName,
}) {
  return (
    <main className="content-screen">
      <div className="screen-heading">
        <p className="eyebrow">Protocol archive // {themeName}</p>
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
          const record = progress.levels[level.internalId ?? level.id]
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
                {record?.bestShots > 0 && (
                  <span>
                    Fewest shots <b>{record.bestShots}</b>
                  </span>
                )}
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

/**
 * Renders consumable inventory and score-funded purchase actions.
 *
 * @param {object} props Component props.
 * @param {object} props.progress Persisted player progress.
 * @param {number} props.totalScore Current cumulative campaign points.
 * @param {(power: object) => void} props.onPurchase Purchase callback.
 * @returns {import('react').JSX.Element} Power Lab screen.
 */
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

/** @returns {import('react').JSX.Element} Keyboard and pointer gameplay instructions. */
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
        <article>
          <span className="guide-index">07</span>
          <div className="guide-icon guide-icon--token"><i /></div>
          <h2>Set your movement mode</h2>
          <p>Use the home-screen toggle for Guided movement or Ricochet play: press the stopped token, pull backward, and release to launch. Shot goals track power, par, limits, and exact stops.</p>
        </article>
      </section>
      <div className="guide-callout">
        <strong>Three contacts reset the chamber.</strong>
        <span>The generated layout stays unchanged, and your previous route remains as a ghost trail.</span>
      </div>
    </main>
  )
}

/**
 * Renders audio, motion, theme, and progress-reset preferences.
 *
 * @param {object} props Current settings and update callbacks.
 * @returns {import('react').JSX.Element} Settings screen.
 */
function Settings({
  settings,
  onChange,
  onReset,
  presentationThemeName,
  onPresentationThemeChange,
}) {
  /** @param {string} key Setting key. @param {unknown} value New value. @returns {void} */
  const update = (key, value) => onChange({ ...settings, [key]: value })
  return (
    <main className="content-screen settings-screen">
      <div className="screen-heading">
        <p className="eyebrow">System controls</p>
        <h1>Operator settings</h1>
        <p>Audio channels and motion preferences are stored only in this browser.</p>
      </div>
      <section className="settings-panel">
        <label className="setting-row">
          <div>
            <strong>Presentation theme</strong>
            <span>Changes artwork, colors, effects, and theme sound overrides.</span>
          </div>
          <select
            aria-label="Presentation theme"
            value={presentationThemeName}
            onChange={(event) => onPresentationThemeChange(event.target.value)}
          >
            {Object.entries(themeDefinitions).map(([themeId, theme]) => (
              <option key={themeId} value={themeId}>
                {theme.name}
              </option>
            ))}
          </select>
        </label>
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

/**
 * Presents a completed attempt, Micro Protocols, rewards, and navigation.
 *
 * @param {object} props Result screen properties.
 * @returns {import('react').JSX.Element} Completion result screen.
 */
export function Results({
  level,
  result,
  improved,
  cumulative,
  onReplay,
  onNext,
  onLevels,
  devMode,
  protocols,
  microRecords,
  microNotice,
  onMicro,
  totalLevels,
  campaignShots = 0,
}) {
  const efficiency = Math.round(result.routeFactor * 100)
  const timeRating = Math.round(result.timeFactor * 100)
  const shotRating = {
    perfect: 'Perfect',
    'under-par': 'Under par',
    par: 'Par',
    'over-par': 'Over par',
  }[result.shotRating]
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
          <span>{result.shotsTaken > 0 ? 'Shots used' : 'Bonus relays'}</span>
          <strong>
            {result.shotsTaken > 0 ? result.shotsTaken : result.earnedBonuses}
          </strong>
          <small>
            {result.shotsTaken > 0
              ? [
                  shotRating,
                  result.shotPar ? `Par ${result.shotPar}` : null,
                  `${campaignShots} campaign-best shots`,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : result.coinsEarned
                ? `+${result.coinsEarned} reward coins`
                : `Total score ${cumulative.toLocaleString()}`}
          </small>
        </div>
      </div>
      <section
        className="micro-protocol-panel"
        aria-labelledby="micro-protocol-heading"
      >
        <div>
          <p className="eyebrow">Optional signal fragments</p>
          <h2 id="micro-protocol-heading">Micro Protocols</h2>
          <p>
            Short challenges test one hazard behavior. Their records stay
            separate from campaign score.
          </p>
          {microNotice && (
            <p className="micro-protocol-notice" role="status">
              {microNotice}
            </p>
          )}
        </div>
        <div className="micro-protocol-grid">
          {protocols.map((protocol) => {
            const record = microRecords[protocol.id]
            return (
              <button
                key={protocol.id}
                className={`micro-protocol-card micro-protocol-card--${protocol.kind}`}
                type="button"
                onClick={() => onMicro(protocol.id)}
              >
                <span>{record?.completed ? 'CLEARED' : 'AVAILABLE'}</span>
                <strong>{protocol.name}</strong>
                <small>{protocol.description}</small>
                <b>
                  {record?.completed
                    ? `Best ${record.bestScore.toLocaleString()}`
                    : `First clear +${protocol.rewardCoins} coins`}
                </b>
              </button>
            )
          })}
        </div>
      </section>
      <div className="results-actions">
        {level.number < totalLevels && (
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

/**
 * Owns startup, navigation, progress, settings, audio, and gameplay screens.
 *
 * @returns {import('react').JSX.Element} Path Protocol application shell.
 */
function PathProtocolApp() {
  const [devMode, setDevMode] = useState(initialDevMode)
  const [progress, setProgress] = useState(() => loadProgress())
  const initialCampaignThemeRef = useRef(
    window.localStorage.getItem(CAMPAIGN_THEME_KEY) ?? 'default',
  )
  const [activeThemeId, setActiveThemeId] = useState(
    initialCampaignThemeRef.current,
  )
  const [activeThemeName, setActiveThemeName] = useState('Default')
  const [presentationThemeName, setPresentationThemeName] = useState(
    initialPresentationTheme,
  )
  const [campaignLevels, setCampaignLevels] = useState(levelConfigs)
  const [screen, setScreen] = useState('home')
  const [selectedLevelId, setSelectedLevelId] = useState('level-01')
  const [selectedMicroId, setSelectedMicroId] = useState(null)
  const [lastResult, setLastResult] = useState(null)
  const [microNotice, setMicroNotice] = useState(null)
  const [mediaManifest, setMediaManifest] = useState(null)
  const [startupAttempt, setStartupAttempt] = useState(0)
  const [mediaReloadVersion, setMediaReloadVersion] = useState(0)
  const [startup, setStartup] = useState({
    status: 'loading',
    label: 'Validating configuration',
    percentage: 0,
    error: null,
  })
  const [started, setStarted] = useState(false)
  const [themeChoiceRequired, setThemeChoiceRequired] = useState(
    () => window.localStorage.getItem(CAMPAIGN_THEME_KEY) === null,
  )
  const [publicThemes, setPublicThemes] = useState([
    {
      id: 'default',
      name: 'Default',
      description: 'The official 100-level Path Protocol campaign.',
      levelCount: levelConfigs.length,
    },
  ])
  const [publicThemesLoading, setPublicThemesLoading] = useState(true)
  const [publicThemesError, setPublicThemesError] = useState('')
  const currentMicroProtocol =
    microProtocols.find((protocol) => protocol.id === selectedMicroId) ?? null
  const selectedConfig =
    currentMicroProtocol?.level ??
    campaignLevels.find((level) => level.id === selectedLevelId) ??
    campaignLevels[0]
  const runtimeConfig = useMemo(
    () =>
      levelForControlMode(
        selectedConfig,
        progress.settings.controlMode,
        gameplayConfig.kineticShot,
      ),
    [selectedConfig, progress.settings.controlMode],
  )
  const currentLevel = useMemo(() => generateLevel(runtimeConfig), [runtimeConfig])
  const totalScore = cumulativeScore(progress)
  const totalShots = cumulativeShots(progress)
  const audioRef = useRef(null)
  const audioLifecycleRef = useRef(null)
  const loadedMediaKeyRef = useRef(null)
  const startedRef = useRef(started)
  const progressRef = useRef(progress)
  const presentationTheme =
    themeDefinitions[presentationThemeName] ??
    themeDefinitions[configuredThemeName]
  progressRef.current = progress
  startedRef.current = started

  if (!audioRef.current) {
    audioRef.current = createAudioManager(progress.settings)
  }

  useEffect(() => {
    let cancelled = false
    const mediaTheme =
      activeThemeId === 'default' ? presentationThemeName : activeThemeId
    const mediaKey = `${mediaTheme}:${mediaReloadVersion}:${startupAttempt}`
    if (
      loadedMediaKeyRef.current &&
      loadedMediaKeyRef.current !== mediaKey
    ) {
      audioRef.current.dispose()
      audioRef.current = createAudioManager(progressRef.current.settings)
    }
    loadedMediaKeyRef.current = mediaKey
    setMediaManifest(null)
    setStartup({
      status: 'loading',
      label: 'Validating configuration',
      percentage: 0,
      error: null,
    })
    loadStartupMedia({
      themeName: mediaTheme,
      validateConfiguration: async () => {
        if (!configurationStatus.valid) {
          throw new Error(configurationStatus.errors.join('; '))
        }
      },
      fetchManifest: async (url) => {
        if (activeThemeId !== 'default') {
          return themeApi.mediaManifest(activeThemeId)
        }
        const response = await fetch(url)
        if (!response.ok) throw new Error('Unable to resolve the active theme media.')
        return response.json()
      },
      baseUrl: import.meta.env.BASE_URL,
      // V3 visual models are loaded and cached by the Three.js renderer.
      // Legacy theme artwork stays in the manifest for Workshop previews only.
      loadVisual: async () => {},
      loadAudio: (entry) => audioRef.current.loadSound(entry),
      onProgress: (snapshot) => {
        if (!cancelled) setStartup({ status: 'loading', error: null, ...snapshot })
      },
    })
      .then(async (manifest) => {
        if (cancelled) return
        setMediaManifest(manifest)
        if (startedRef.current) await audioRef.current.unlock()
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
  }, [activeThemeId, mediaReloadVersion, presentationThemeName, startupAttempt])

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

  useEffect(() => {
    let cancelled = false
    themeApi
      .list()
      .then(({ themes }) => {
        if (!cancelled) setPublicThemes(themes)
      })
      .catch((error) => {
        if (!cancelled) setPublicThemesError(error.message)
      })
      .finally(() => {
        if (!cancelled) setPublicThemesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (initialCampaignThemeRef.current === 'default') return
    let cancelled = false
    themeApi
      .campaign(initialCampaignThemeRef.current)
      .then((campaign) => {
        if (cancelled) return
        setActiveThemeName(campaign.theme.name)
        setCampaignLevels(campaign.levels)
        setSelectedLevelId(campaign.levels[0].id)
      })
      .catch(() => {
        if (cancelled) return
        window.localStorage.removeItem(CAMPAIGN_THEME_KEY)
        setActiveThemeId('default')
        setActiveThemeName('Default')
        setCampaignLevels(levelConfigs)
        setThemeChoiceRequired(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  /** @param {string} nextScreen Application screen ID. @returns {void} */
  const navigate = (nextScreen) => {
    setScreen(nextScreen)
  }

  /** Toggles developer diagnostics and persists the preference. */
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

  /** @param {string} levelId Campaign level ID. @returns {void} */
  const playLevel = (levelId) => {
    setSelectedMicroId(null)
    setSelectedLevelId(levelId)
    setLastResult(null)
    setMicroNotice(null)
    navigate('game')
  }

  /** @param {string} themeId Public or owned theme ID. @returns {Promise<void>} */
  const playTheme = async (themeId) => {
    const campaign =
      themeId === 'default'
        ? { theme: { name: 'Default' }, levels: levelConfigs }
        : await themeApi.campaign(themeId)
    setActiveThemeId(themeId)
    setActiveThemeName(campaign.theme.name)
    setCampaignLevels(campaign.levels)
    const themedProgress = loadProgress(window.localStorage, themeId)
    progressRef.current = themedProgress
    setProgress(themedProgress)
    setSelectedLevelId(campaign.levels[0].id)
    setSelectedMicroId(null)
    setLastResult(null)
    setMediaReloadVersion((version) => version + 1)
    navigate('levels')
  }

  /** @param {string} themeName Configured presentation theme name. @returns {void} */
  const changePresentationTheme = (themeName) => {
    if (!Object.hasOwn(themeDefinitions, themeName)) return
    window.localStorage.setItem(PRESENTATION_THEME_KEY, themeName)
    setPresentationThemeName(themeName)
  }

  /** @param {string} protocolId Optional challenge ID. @returns {void} */
  const playMicroProtocol = (protocolId) => {
    setSelectedMicroId(protocolId)
    setMicroNotice(null)
    navigate('game')
  }

  /** @param {'guided'|'kinetic'} mode Persistent campaign movement mode. @returns {void} */
  const changeControlMode = (mode) => {
    if (!['guided', 'kinetic'].includes(mode)) return
    handleSettings({ ...progress.settings, controlMode: mode })
  }

  /** Advances results to the next campaign level or level selection. */
  const continuePlay = () => {
    const nextNumber = Math.min(
      progress.player.highestUnlockedLevel,
      campaignLevels.length,
    )
    playLevel(`level-${String(nextNumber).padStart(2, '0')}`)
  }

  /**
   * Persists a campaign or Micro Protocol completion and opens results.
   *
   * @param {object} result Engine completion payload.
   * @returns {void}
   */
  const handleComplete = (result) => {
    if (currentMicroProtocol) {
      if (devMode) {
        recordPlaytestRun(currentLevel, result)
        setMicroNotice(`${currentMicroProtocol.name} playtest run captured.`)
        setSelectedMicroId(null)
        setScreen('results')
        return
      }
      const recorded = recordMicroProtocolResult(
        progressRef.current,
        currentMicroProtocol,
        result,
      )
      progressRef.current = recorded.progress
      saveProgress(recorded.progress, window.localStorage, activeThemeId)
      setProgress(recorded.progress)
      setMicroNotice(
        recorded.coinsEarned
          ? `${currentMicroProtocol.name} cleared — +${recorded.coinsEarned} coins.`
          : `${currentMicroProtocol.name} cleared${
              recorded.improved ? ' with a new record' : ''
            }.`,
      )
      setSelectedMicroId(null)
      setScreen('results')
      return
    }
    if (devMode) {
      recordPlaytestRun(currentLevel, result)
      setLastResult({ result, improved: false, level: currentLevel })
      setScreen('results')
      return
    }
    const coinsBefore = progressRef.current.player.coins
    const recorded = recordLevelResult(
      progressRef.current,
      currentLevel,
      result,
      campaignLevels.length,
    )
    const recordedResult = {
      ...result,
      coinsEarned: recorded.progress.player.coins - coinsBefore,
    }
    progressRef.current = recorded.progress
    saveProgress(recorded.progress, window.localStorage, activeThemeId)
    setProgress(recorded.progress)
    setLastResult({ result: recordedResult, improved: recorded.improved, level: currentLevel })
    setScreen('results')
  }

  /** Records a failed campaign attempt for progression statistics. */
  const handleFailedAttempt = () => {
    if (devMode || currentMicroProtocol) return
    setProgress((current) => {
      const updated = recordFailedAttempt(
        current,
        currentLevel.internalId ?? currentLevel.id,
      )
      saveProgress(updated, window.localStorage, activeThemeId)
      return updated
    })
  }

  /** @param {object} settings Updated player settings. @returns {void} */
  const handleSettings = (settings) => {
    const updated = { ...progress, settings }
    setProgress(updated)
    saveProgress(updated, window.localStorage, activeThemeId)
    audioRef.current.updateSettings(settings)
  }

  /** @param {object} powerup Power definition to purchase. @returns {void} */
  const handlePurchasePowerup = (powerup) => {
    const purchased = purchasePowerup(progressRef.current, powerup)
    if (!purchased.purchased) return
    progressRef.current = purchased.progress
    setProgress(purchased.progress)
    saveProgress(purchased.progress, window.localStorage, activeThemeId)
    audioRef.current.play(powerup.soundId)
  }

  /** @param {string} powerupId Consumed power ID. @returns {void} */
  const handleUsePowerup = (powerupId) => {
    if (devMode) return true
    const consumed = consumePowerup(progressRef.current, powerupId)
    if (!consumed.consumed) return false
    progressRef.current = consumed.progress
    setProgress(consumed.progress)
    saveProgress(consumed.progress, window.localStorage, activeThemeId)
    return true
  }

  /** @param {object} coin Newly collected course coin. @returns {void} */
  const handleCoinCollected = (coin) => {
    if (currentMicroProtocol) return false
    if (devMode) return true
    const collection = collectCourseCoin(
      progressRef.current,
      currentLevel.internalId ?? currentLevel.id,
      coin,
    )
    if (!collection.collected) return false
    progressRef.current = collection.progress
    setProgress(collection.progress)
    saveProgress(collection.progress, window.localStorage, activeThemeId)
    return true
  }

  /** Confirms and replaces the active theme's progress with a fresh record. */
  const handleReset = () => {
    if (!window.confirm('Reset every local score, unlock, and setting? This cannot be undone.')) return
    const initial = resetProgress(window.localStorage, activeThemeId)
    setProgress(initial)
    audioRef.current.updateSettings(initial.settings)
    setScreen('home')
  }

  /** Opens the next campaign level when one exists. */
  const nextLevel = () => {
    const nextNumber = Math.min(campaignLevels.length, currentLevel.number + 1)
    playLevel(`level-${String(nextNumber).padStart(2, '0')}`)
  }

  /** Opens the previous campaign level when one exists. */
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

  if (themeChoiceRequired) {
    return (
      <PublicThemeChooser
        themes={publicThemes}
        loading={publicThemesLoading}
        error={publicThemesError}
        onSelect={async (themeId) => {
          await playTheme(themeId)
          window.localStorage.setItem(CAMPAIGN_THEME_KEY, themeId)
          setThemeChoiceRequired(false)
          navigate('home')
        }}
      />
    )
  }

  return (
    <div
      className={`app-shell ${progress.settings.reducedMotion ? 'reduce-motion' : ''}`}
      style={{
        '--color-bg': presentationTheme.colors.background,
        '--color-panel': presentationTheme.colors.panel,
        '--color-token': presentationTheme.colors.token,
        '--color-target': presentationTheme.colors.mainTarget,
        '--color-bonus': presentationTheme.colors.bonusTarget,
        '--color-hazard': presentationTheme.colors.hazard,
        '--color-danger': presentationTheme.colors.danger,
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
          onAbout={() => navigate('about')}
          onSettings={() => navigate('settings')}
          onWorkshop={() => navigate('workshop')}
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
          totalLevels={campaignLevels.length}
          controlMode={progress.settings.controlMode}
          onControlModeChange={changeControlMode}
          campaignShots={totalShots}
        />
      )}
      {screen === 'levels' && (
        <LevelSelect
          levels={campaignLevels}
          progress={progress}
          onSelect={playLevel}
          onPowers={() => navigate('powers')}
          devMode={devMode}
          themeName={activeThemeName}
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
      {screen === 'about' && <About onWorkshop={() => navigate('workshop')} />}
      {screen === 'settings' && (
        <Settings
          settings={progress.settings}
          onChange={handleSettings}
          onReset={handleReset}
          presentationThemeName={presentationThemeName}
          onPresentationThemeChange={changePresentationTheme}
        />
      )}
      {screen === 'workshop' && (
        <ThemeWorkshop
          onPlayTheme={playTheme}
          audio={audioRef.current}
          mediaManifest={mediaManifest}
          reducedMotion={progress.settings.reducedMotion}
          gameplayConfig={gameplayConfig}
          powerups={powerups}
        />
      )}
      {screen === 'game' && (
        <GameView
          key={`${activeThemeId}:${currentLevel.internalId ?? currentLevel.id}:${progress.settings.controlMode}`}
          level={currentLevel}
          levelBest={
            currentMicroProtocol
              ? progress.microProtocols[currentMicroProtocol.id]?.bestScore ?? 0
              : progress.levels[currentLevel.internalId ?? currentLevel.id]
                  ?.bestScore ?? 0
          }
          cumulative={totalScore}
          audio={audioRef.current}
          onComplete={handleComplete}
          onAttemptFailed={handleFailedAttempt}
          onExit={() => {
            if (currentMicroProtocol) {
              setSelectedMicroId(null)
              navigate('results')
            } else {
              navigate('levels')
            }
          }}
          devMode={devMode}
          onPreviousLevel={previousLevel}
          onNextLevel={nextLevel}
          totalLevels={campaignLevels.length}
          powerups={powerups}
          inventory={
            currentMicroProtocol ? {} : progress.player.inventory
          }
          collectedCoins={
            currentMicroProtocol ? {} : progress.player.collectedCoins
          }
          onUsePowerup={
            currentMicroProtocol ? () => false : handleUsePowerup
          }
          onCoinCollected={handleCoinCollected}
          mediaManifest={mediaManifest}
          reducedMotion={progress.settings.reducedMotion}
          tokenCollisionTolerance={
            gameplayConfig.collision.tokenToleranceUnits
          }
          pointerResponsePerSecond={gameplayConfig.input.pointerResponsePerSecond}
          keyboardSpeedUnitsPerSecond={
            gameplayConfig.input.keyboardSpeedUnitsPerSecond
          }
          microProtocol={currentMicroProtocol}
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
          protocols={microProtocols.filter(
            (protocol) =>
              activeThemeId === 'default' &&
              protocol.tier === Math.min(9, Math.ceil(lastResult.level.number / 10)) &&
              lastResult.level.number >= protocol.unlockLevel,
          )}
          microRecords={progress.microProtocols}
          microNotice={microNotice}
          onMicro={playMicroProtocol}
          totalLevels={campaignLevels.length}
          campaignShots={totalShots}
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

/**
 * Displays actionable development configuration failures safely.
 *
 * @param {{errors: string[]}} props Validation failures.
 * @returns {import('react').JSX.Element} Configuration error screen.
 */
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

/**
 * Selects the validated application or safe configuration-error boundary.
 *
 * @returns {import('react').JSX.Element} Root application.
 */
export default function App() {
  if (!configurationStatus.valid) {
    return (
      <>
        <ConfigurationErrorScreen errors={configurationStatus.errors} />
        <AnalyticsConsent />
      </>
    )
  }
  return (
    <>
      <PathProtocolApp />
      <AnalyticsConsent />
    </>
  )
}
