import { Application } from 'pixi.js'

/**
 * Creates and verifies the WebGL-only Pixi application.
 *
 * @param {object} options Application options.
 * @param {HTMLElement} options.container Element that determines canvas CSS size.
 * @param {typeof Application} [options.ApplicationClass] Injectable Pixi class.
 * @param {number} [options.resolution=devicePixelRatio] Device pixels per CSS pixel.
 * @returns {Promise<Application>} Initialized WebGL application.
 */
export async function createWebGLApplication({
  container,
  ApplicationClass = Application,
  resolution = globalThis.devicePixelRatio ?? 1,
}) {
  const app = new ApplicationClass()
  await app.init({
    preference: 'webgl',
    resizeTo: container,
    antialias: true,
    autoStart: false,
    backgroundAlpha: 0,
    resolution: Math.min(2, Math.max(1, resolution)),
  })
  const rendererName = String(
    app.renderer?.name ?? app.renderer?.type ?? 'webgl',
  ).toLowerCase()
  if (rendererName.includes('webgpu')) {
    app.destroy(true)
    throw new Error('Path Protocol requires a WebGL renderer.')
  }
  app.ticker?.stop()
  return app
}

/**
 * Stops and releases a Pixi application's GPU and scene resources.
 *
 * @param {Application|null|undefined} app Pixi application.
 * @returns {void}
 */
export function destroyWebGLApplication(app) {
  if (!app) return
  app.ticker?.stop()
  app.destroy(true, { children: true, context: true })
}
