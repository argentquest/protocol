import SvgArena from '../rendering/SvgArena.jsx'
import SvgShape from '../rendering/SvgShape.jsx'

function DebugLayer({ level, staticObstacles }) {
  return (
    <g className="debug-layer" aria-hidden="true">
      <polyline
        className="debug-route"
        points={(level.validatedPath ?? [])
          .map((point) => `${point.x},${point.y}`)
          .join(' ')}
      />
      {(level.validatedPath ?? []).map((point, index) => (
        <circle
          key={`${point.x}-${point.y}-${index}`}
          className="debug-route-node"
          cx={point.x}
          cy={point.y}
          r="5"
        />
      ))}
      {staticObstacles.map((obstacle) => (
        <SvgShape
          key={`debug-${obstacle.id}`}
          item={obstacle}
          className="debug-hitbox"
        />
      ))}
      {level.movingObstacles.map((obstacle) => (
        <SvgShape
          key={`envelope-${obstacle.id}`}
          item={{
            ...obstacle,
            width:
              obstacle.width +
              (obstacle.axis === 'x' ? obstacle.amplitude * 2 : 0),
            height:
              obstacle.height +
              (obstacle.axis === 'y' ? obstacle.amplitude * 2 : 0),
          }}
          className="debug-motion-envelope"
        />
      ))}
      {level.trackingObstacles.map((obstacle) => (
        <rect
          key={`tracking-zone-${obstacle.id}`}
          className="debug-tracking-zone"
          x={obstacle.zone.x}
          y={obstacle.zone.y}
          width={obstacle.zone.width}
          height={obstacle.zone.height}
        />
      ))}
      <circle
        className="debug-center"
        cx={level.startPoint.x}
        cy={level.startPoint.y}
        r="8"
      />
      <text
        className="debug-label"
        x={level.startPoint.x + 14}
        y={level.startPoint.y - 14}
      >
        START
      </text>
      <text
        className="debug-label"
        x={level.mainTarget.x + 18}
        y={level.mainTarget.y - 18}
      >
        MAIN
      </text>
    </g>
  )
}

export default function GameArena({
  level,
  devMode,
  debugVisible,
  staticObstacles,
  routeScanPath,
  movingRefs,
  trackingRefs,
  ghostTrails,
  attemptNumber,
  trailRef,
  visibleBonus,
  availableCoins,
  tokenRef,
  activePowerIds,
  svgRef,
  dragging,
  mainTargetReached,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}) {
  const arenaPoints = level.arena.shape === 'polygon' ? level.arena.points : null

  return (
    <div className="arena-shell">
      <div className="arena-corners" aria-hidden="true" />
      <svg
        ref={svgRef}
        className={`game-arena ${dragging ? 'is-dragging' : ''}`}
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="application"
        aria-label={`${level.name} obstacle course`}
      >
        <defs>
          <filter id="soft-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="lab-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" className="grid-line" fill="none" />
          </pattern>
          <clipPath id={`arena-clip-${level.id}`}>
            <SvgArena arena={level.arena} />
          </clipPath>
        </defs>

        <g className="arena-base">
          <SvgArena arena={level.arena} />
        </g>
        <g clipPath={`url(#arena-clip-${level.id})`}>
          <rect className="arena-grid" width="1000" height="1000" fill="url(#lab-grid)" />
          <g className="arena-scanlines">
            <path d="M0 250 H1000 M0 500 H1000 M0 750 H1000" />
          </g>

          {devMode && debugVisible && (
            <DebugLayer level={level} staticObstacles={staticObstacles} />
          )}
          {routeScanPath && (
            <polyline
              className="power-route-scan"
              points={routeScanPath.map((point) => `${point.x},${point.y}`).join(' ')}
              aria-hidden="true"
            />
          )}

          <g className="obstacle-layer">
            {staticObstacles.map((obstacle) => (
              <SvgShape key={obstacle.id} item={obstacle} className="obstacle">
                <span />
              </SvgShape>
            ))}
            {level.movingObstacles.map((obstacle) => (
              <SvgShape
                key={obstacle.id}
                ref={(element) => {
                  if (element) movingRefs.current.set(obstacle.id, element)
                  else movingRefs.current.delete(obstacle.id)
                }}
                item={obstacle}
                className="obstacle obstacle--moving"
              />
            ))}
            {level.trackingObstacles.map((obstacle) => (
              <SvgShape
                key={obstacle.id}
                ref={(element) => {
                  if (element) trackingRefs.current.set(obstacle.id, element)
                  else trackingRefs.current.delete(obstacle.id)
                }}
                item={obstacle}
                className="obstacle obstacle--tracking"
              >
                <circle
                  className="tracking-eye"
                  r={Math.min(obstacle.width, obstacle.height) * 0.16}
                />
              </SvgShape>
            ))}
          </g>

          <g className="trail-layer">
            {ghostTrails.map((trail, index) => (
              <polyline
                key={`${attemptNumber}-${index}`}
                className="ghost-trail"
                points={trail.map((point) => `${point.x},${point.y}`).join(' ')}
              />
            ))}
            <polyline ref={trailRef} className="active-trail" points="" />
          </g>

          <g className="target-layer">
            <SvgShape
              item={level.mainTarget}
              className={`target target--main ${mainTargetReached ? 'is-reached' : ''}`}
            >
              <circle className="target-ring" r={level.mainTarget.width * 0.68} />
            </SvgShape>
            {visibleBonus && (
              <SvgShape item={visibleBonus} className="target target--bonus">
                <circle className="target-ring" r={visibleBonus.width * 0.7} />
              </SvgShape>
            )}
          </g>

          <g className="coin-layer">
            {availableCoins.map((coin) => (
              <SvgShape key={coin.id} item={coin} className="course-coin">
                <circle className="coin-core" r={coin.width * 0.18} />
              </SvgShape>
            ))}
          </g>

          <g className="token-layer">
            <SvgShape ref={tokenRef} item={level.token} className="token">
              {activePowerIds.includes('obstacleShield') && (
                <circle
                  className="power-aura power-aura--obstacle"
                  r={level.token.width * 0.78}
                />
              )}
              {activePowerIds.includes('fullShield') && (
                <circle
                  className="power-aura power-aura--full"
                  r={level.token.width * 0.9}
                />
              )}
              <circle className="token-core" r={Math.max(5, level.token.width * 0.13)} />
            </SvgShape>
          </g>
        </g>

        {arenaPoints && (
          <polyline
            className="arena-outline"
            points={`${arenaPoints.map((point) => point.join(',')).join(' ')} ${arenaPoints[0].join(',')}`}
          />
        )}
      </svg>
      <div className="arena-label arena-label--top">PATH PROTOCOL // LIVE CHAMBER</div>
      <div className="arena-label arena-label--bottom">
        SEED {level.seed.split('-').slice(-2).join('-').toUpperCase()}
      </div>
    </div>
  )
}
