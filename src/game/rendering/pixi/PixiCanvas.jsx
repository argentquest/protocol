import { useEffect, useRef } from 'react'
import {
  createWebGLApplication,
  destroyWebGLApplication,
} from './PixiApplication.js'

/**
 * Mounts exactly one imperative Pixi canvas and disposes it with React.
 *
 * @param {object} props Engine, media cache, level, and lifecycle callbacks.
 * @returns {import('react').JSX.Element} Accessible arena host.
 */
export default function PixiCanvas({
  onReady,
  onError = () => {},
  createApplication = createWebGLApplication,
  className = 'pixi-arena',
  ariaLabel,
}) {
  const containerRef = useRef(null)
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  onReadyRef.current = onReady
  onErrorRef.current = onError

  useEffect(() => {
    let disposed = false
    let app = null
    const mount = async () => {
      app = await createApplication({ container: containerRef.current })
      if (disposed) {
        destroyWebGLApplication(app)
        return
      }
      containerRef.current.replaceChildren(app.canvas)
      await onReadyRef.current(app, containerRef.current)
    }
    mount().catch((error) => {
      if (!disposed) onErrorRef.current(error)
    })
    return () => {
      disposed = true
      if (app) destroyWebGLApplication(app)
    }
  }, [createApplication])

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid="pixi-canvas"
      role="application"
      aria-label={ariaLabel}
    />
  )
}
