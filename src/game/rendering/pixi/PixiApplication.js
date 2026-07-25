import { Application } from 'pixi.js'

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

export function destroyWebGLApplication(app) {
  if (!app) return
  app.ticker?.stop()
  app.destroy(true, { children: true, context: true })
}
