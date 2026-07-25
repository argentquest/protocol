export default function GameHeader({
  level,
  levelBest,
  cumulative,
  devMode,
  debugVisible,
  totalLevels,
  onExit,
  onRestart,
  onPreviousLevel,
  onNextLevel,
  onToggleDebug,
}) {
  return (
    <header className="game-header">
      <div className="game-header__actions">
        <button className="icon-button" type="button" onClick={onExit} aria-label="Exit level">
          <span aria-hidden="true">←</span>
        </button>
        <button
          className="restart-button"
          type="button"
          onClick={onRestart}
          aria-label="Restart attempt"
          title="Restart attempt (R)"
        >
          <span aria-hidden="true">↻</span>
          Restart
          <kbd>R</kbd>
        </button>
        {devMode && (
          <>
            <button
              className="dev-step-button"
              type="button"
              onClick={onPreviousLevel}
              disabled={level.number === 1}
              aria-label="Previous playtest level"
            >
              ‹
            </button>
            <button
              className="dev-step-button"
              type="button"
              onClick={onNextLevel}
              disabled={level.number === totalLevels}
              aria-label="Next playtest level"
            >
              ›
            </button>
            <button
              className={`debug-toggle ${debugVisible ? 'is-on' : ''}`}
              type="button"
              onClick={onToggleDebug}
              aria-pressed={debugVisible}
            >
              Overlay
            </button>
          </>
        )}
      </div>
      <div>
        <p className="eyebrow">Protocol {String(level.number).padStart(2, '0')}</p>
        <h1>{level.name}</h1>
      </div>
      <div className="game-header__scores">
        <span>Level best</span>
        <strong>{levelBest.toLocaleString()}</strong>
        <span>Total</span>
        <strong>{cumulative.toLocaleString()}</strong>
      </div>
    </header>
  )
}
