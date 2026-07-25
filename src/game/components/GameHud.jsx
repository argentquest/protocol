import { formatDistance, formatTime } from '../ui/formatters.js'

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
        <span>Bonus relays</span>
        <strong>
          {hud.earnedBonuses}/{level.bonuses.maximumTargets}
        </strong>
      </div>
      <p className="status-message" data-phase={phase}>
        <span className="status-dot" />
        {message}
      </p>
      <p className="hud-hint">
        Click the token to start mouse control and click again to stop, or toggle
        keyboard control with Space. The token’s full shape must clear every edge.
      </p>
      <PowerTray
        powerups={powerups}
        activePowerIds={activePowerIds}
        inventory={inventory}
        devMode={devMode}
        onActivate={onActivatePowerup}
      />
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
