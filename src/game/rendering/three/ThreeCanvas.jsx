import { useEffect, useRef } from 'react'
import {
  createThreeApplication,
  destroyThreeApplication,
} from './ThreeApplication.js'

/**
 * Mounts exactly one imperative Three.js canvas and disposes it with React.
 *
 * @param {object} props Canvas lifecycle configuration.
 * @returns {import('react').JSX.Element} Accessible Three.js arena host.
 */
export default function ThreeCanvas({
  onReady,
  onError = () => {},
  createApplication = createThreeApplication,
  className = 'three-arena',
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
    /** @returns {Promise<void>} Completion of WebGL canvas initialization. */
    const mount = async () => {
      app = await createApplication({ container: containerRef.current })
      if (disposed) {
        destroyThreeApplication(app)
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
      if (app) destroyThreeApplication(app)
    }
  }, [createApplication])

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid="three-canvas"
      role="application"
      aria-label={ariaLabel}
    />
  )
}
