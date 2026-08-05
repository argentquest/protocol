import { formatDistance, formatTime } from '../ui/formatters.js'

/**
 * Renders numbered consumable controls and their active/available states.
 *
 * @param {object} props Power definitions, inventory, and activation callback.
 * @returns {import('react').JSX.Element} Power control tray.
 */
function PowerTray({ powerups, activePowerIds, inventory, devMode, onActivate }) {
  return (
    <div className="power-tray" aria-label="Power-up inventory">
      {powerups.map((powerup) => {
        const active = activePowerIds.includes(powerup.effect)
        const quantity = devMode ? '∞' : Number(inventory[powerup.id]) || 0
        return (
          <button
            key={powerup.id}
            type="button"
            className={`power-slot ${active ? 'is-active' : ''}`}
            style={{ '--power-color': powerup.color }}
            onClick={() => onActivate(powerup)}
            aria-label={`${powerup.name}, ${quantity} available`}
          >
            <kbd>{powerup.key}</kbd>
            <span>{powerup.name}</span>
            <strong>{quantity}</strong>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Renders development-only engine and course diagnostics.
 *
 * @param {object} props HUD snapshot, level, and unclaimed coin count.
 * @returns {import('react').JSX.Element} Debug diagnostics panel.
 */
function DebugPanel({ hud, level, availableCoinCount }) {
  return (
    <div className="debug-panel" data-testid="playtest-diagnostics">
      <div className="debug-panel__heading">
        <span>Playtest diagnostics</span>
        <strong>{hud.fps} FPS</strong>
      </div>
      <dl>
        <div>
          <dt>Seed</dt>
          <dd>{level.seed}</dd>
        </div>
        <div>
          <dt>Generated</dt>
          <dd>
            {level.generationSummary.generatedObstacles}/
            {level.generationSummary.requestedObstacles} obstacles
          </dd>
        </div>
        <div>
          <dt>Route nodes</dt>
          <dd>{level.validatedPath?.length ?? 0}</dd>
        </div>
        <div>
          <dt>Trackers</dt>
          <dd>{level.trackingObstacles.length}</dd>
        </div>
        <div>
          <dt>Coins left</dt>
          <dd>{availableCoinCount}</dd>
        </div>
        <div>
          <dt>Time factor</dt>
          <dd>{Math.round(hud.timeFactor * 100)}%</dd>
        </div>
        <div>
          <dt>Route factor</dt>
          <dd>{Math.round(hud.routeFactor * 100)}%</dd>
        </div>
        <div>
          <dt>Penalty</dt>
          <dd>{Math.round(hud.totalPenalty).toLocaleString()}</dd>
        </div>
      </dl>
    </div>
  )
}

/**
 * Projects throttled engine snapshots into player-facing HUD controls.
 *
 * @param {object} props HUD properties.
 * @returns {import('react').JSX.Element} HUD overlay.
 */
export default function GameHud({
  hud,
  level,
  phase,
  message,
  powerups,
  activePowerIds,
  inventory,
  devMode,
  availableCoinCount,
  onActivatePowerup,
}) {
  return (
    <aside className="hud-panel" aria-label="Live attempt status">
      <div className="hud-readout hud-readout--primary">
        <span>Live score</span>
        <strong>{hud.score.toLocaleString()}</strong>
        <small>/ {hud.attainableMaximum.toLocaleString()}</small>
      </div>
      <div className="hud-grid">
        <div className="hud-readout">
          <span>Time</span>
          <strong>{formatTime(hud.elapsedMs)}</strong>
          <small>Par {formatTime(level.scoring.parTimeMs)}</small>
        </div>
        <div className="hud-readout">
          <span>Travel</span>
          <strong>{formatDistance(hud.actualDistance)}</strong>
          <small>Par {formatDistance(level.scoring.parDistance)}</small>
        </div>
      </div>
      <div className="collision-meter">
        <span>Hazard contacts</span>
        <div className="collision-pips" aria-label={`${hud.collisions} of 3 collisions`}>
          {Array.from({ length: 3 }, (_, index) => (
            <i key={index} className={index < hud.collisions ? 'is-hit' : ''} />
          ))}
        </div>
      </div>
      <div className="bonus-readout">
        <span>
          {level.shotMechanic
            ? hud.kinetic?.maximumShots === null
              ? 'Shots launched'
              : 'Shots used / limit'
            : 'Bonus relays'}
        </span>
        <strong>
          {level.shotMechanic
            ? hud.kinetic?.maximumShots === null
              ? hud.kinetic?.shotsTaken ?? 0
              : `${hud.kinetic?.shotsTaken ?? 0} / ${hud.kinetic.maximumShots}`
            : `${hud.earnedBonuses}/${level.bonuses.maximumTargets}`}
        </strong>
        {level.shotMechanic &&
          (hud.kinetic?.shotsRemaining !== null || hud.kinetic?.par !== null) && (
          <small>
            {[
              hud.kinetic?.shotsRemaining === null
                ? null
                : `${hud.kinetic.shotsRemaining} remaining`,
              hud.kinetic?.par === null ? null : `Par ${hud.kinetic.par}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </small>
        )}
      </div>
      {level.shotMechanic && (
        <div className="shot-power">
          <div>
            <span>Shot power</span>
            <strong>{Math.round((hud.kinetic?.aimPower ?? 0) * 100)}%</strong>
          </div>
          <div
            className="shot-power__track"
            role="progressbar"
            aria-label="Shot power"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={Math.round((hud.kinetic?.aimPower ?? 0) * 100)}
          >
            <i style={{ width: `${(hud.kinetic?.aimPower ?? 0) * 100}%` }} />
          </div>
        </div>
      )}
      <p className="status-message" data-phase={phase}>
        <span className="status-dot" />
        {message}
      </p>
      <p className="hud-hint">
        {level.shotMechanic
          ? (level.shotMechanic.inputStyle ?? 'drag-release') === 'drag-release'
            ? 'Press the stopped token, pull opposite the launch direction, and release. With keyboard, press Space, hold an arrow direction, then press Space again. Steering is locked in flight.'
            : 'Click the stopped token, aim, and click again to launch. With keyboard, press Space, hold an arrow direction, then press Space again. Steering is locked in flight.'
          : 'Click the token to start mouse control and click again to stop, or toggle keyboard control with Space. The token’s full shape must clear every edge.'}
      </p>
      {!level.shotMechanic && (
        <PowerTray
          powerups={powerups}
          activePowerIds={activePowerIds}
          inventory={inventory}
          devMode={devMode}
          onActivate={onActivatePowerup}
        />
      )}
      {devMode && (
        <DebugPanel
          hud={hud}
          level={level}
          availableCoinCount={availableCoinCount}
        />
      )}
    </aside>
  )
}
