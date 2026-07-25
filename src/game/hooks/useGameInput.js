import { useCallback, useEffect } from 'react'
import { shapesIntersect } from '../geometry/geometry.js'
import { pointerToLogical } from '../runtime/gameRuntime.js'

export default function useGameInput({
  level,
  audio,
  powerups,
  runtimeRef,
  svgRef,
  setPhase,
  setMessage,
  completeAttempt,
  resetAttempt,
  handleManualRestart,
  activatePowerup,
}) {
  const beginAttempt = useCallback(
    (point, pointerId, inputMode) => {
      const runtime = runtimeRef.current
      if (runtime.mode !== 'ready' && runtime.mode !== 'bonus-ready') return
      audio.ensureContext()
      audio.startMusic()
      runtime.pointerId = pointerId
      runtime.inputMode = inputMode
      runtime.dragging = true
      const pursuingBonus = runtime.mode === 'bonus-ready'
      runtime.mode = pursuingBonus ? 'dragging-bonus' : 'dragging-main'
      if (!pursuingBonus) {
        runtime.startedAt = performance.now()
        runtime.trail = [{ ...runtime.tokenPosition }]
      }
      runtime.lastPointerPosition = { ...point }
      runtime.pendingPoint = point
      runtime.pointerTarget = inputMode === 'mouse' ? point : null
      runtime.pointerRevision += 1
      setPhase(pursuingBonus ? 'dragging-bonus' : 'dragging-main')
      setMessage(pursuingBonus ? 'Bonus relay committed' : 'Main protocol target active')
      audio.play('dragStart')
    },
    [audio, runtimeRef, setMessage, setPhase],
  )

  const finishAttempt = useCallback(
    (releaseLabel) => {
      const runtime = runtimeRef.current
      if (!runtime.dragging) return
      runtime.pressedDirections.clear()
      if (runtime.mode === 'target-reached') {
        completeAttempt(false)
      } else if (runtime.mode === 'dragging-bonus') {
        completeAttempt(true)
      } else {
        resetAttempt(`${releaseLabel} before target — recalibrating level`)
      }
    },
    [completeAttempt, resetAttempt, runtimeRef],
  )

  const handlePointerDown = useCallback(
    (event) => {
      if (event.button !== 0 || (event.pointerType && event.pointerType !== 'mouse')) return
      const runtime = runtimeRef.current
      if (runtime.mode !== 'ready' && runtime.mode !== 'bonus-ready') return
      event.preventDefault()
      const point = pointerToLogical(event, svgRef.current)
      const token = { ...level.token, ...runtime.tokenPosition }
      const pointerMarker = { shape: 'circle', x: point.x, y: point.y, size: 2 }
      if (!shapesIntersect(token, pointerMarker)) return

      svgRef.current.setPointerCapture(event.pointerId)
      beginAttempt(point, event.pointerId, 'mouse')
    },
    [beginAttempt, level.token, runtimeRef, svgRef],
  )

  const handlePointerMove = useCallback(
    (event) => {
      const runtime = runtimeRef.current
      if (
        !runtime.dragging ||
        runtime.inputMode !== 'mouse' ||
        event.pointerId !== runtime.pointerId
      ) {
        return
      }
      event.preventDefault()
      runtime.pointerTarget = pointerToLogical(event, svgRef.current)
      runtime.pointerRevision += 1
    },
    [runtimeRef, svgRef],
  )

  const handlePointerUp = useCallback(
    (event) => {
      const runtime = runtimeRef.current
      if (
        !runtime.dragging ||
        runtime.inputMode !== 'mouse' ||
        event.pointerId !== runtime.pointerId
      ) {
        return
      }
      event.preventDefault()
      finishAttempt('Mouse released')
    },
    [finishAttempt, runtimeRef],
  )

  useEffect(() => {
    const isTypingTarget = (event) =>
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement

    const handleKeyDown = (event) => {
      if (isTypingTarget(event)) return
      const runtime = runtimeRef.current
      if (event.key.startsWith('Arrow')) {
        event.preventDefault()
        if (runtime.dragging && runtime.inputMode === 'keyboard') {
          runtime.pressedDirections.add(event.key)
        }
        return
      }
      if (event.repeat) return
      if (event.code === 'Space') {
        event.preventDefault()
        if (runtime.dragging && runtime.inputMode === 'keyboard') {
          finishAttempt('Keyboard hold released')
        } else if (runtime.mode === 'ready' || runtime.mode === 'bonus-ready') {
          beginAttempt(runtime.tokenPosition, null, 'keyboard')
          setMessage('Keyboard control active — steer with the arrow keys, Space to release')
        }
        return
      }
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault()
        handleManualRestart()
        return
      }
      const powerup = powerups.find((candidate) => candidate.key === event.key)
      if (!powerup) return
      event.preventDefault()
      activatePowerup(powerup)
    }

    const handleKeyUp = (event) => {
      if (!event.key.startsWith('Arrow')) return
      runtimeRef.current.pressedDirections.delete(event.key)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [
    activatePowerup,
    beginAttempt,
    finishAttempt,
    handleManualRestart,
    powerups,
    runtimeRef,
    setMessage,
  ])

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  }
}
