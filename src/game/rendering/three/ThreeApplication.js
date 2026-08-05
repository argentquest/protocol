import {
  ACESFilmicToneMapping,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'

/**
 * Creates the WebGL-only Three.js application used by the V3 arena.
 *
 * @param {object} options Application dependencies.
 * @param {HTMLElement} options.container Element defining the CSS-pixel size.
 * @param {typeof WebGLRenderer} [options.RendererClass] Injectable renderer constructor.
 * @param {number} [options.resolution=devicePixelRatio] Device pixels per CSS pixel.
 * @returns {Promise<{renderer:WebGLRenderer,canvas:HTMLCanvasElement}>} Three application facade.
 */
export async function createThreeApplication({
  container,
  RendererClass = WebGLRenderer,
  resolution = globalThis.devicePixelRatio ?? 1,
}) {
  const renderer = new RendererClass({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(2, Math.max(1, resolution)))
  renderer.setSize(
    Math.max(1, container?.clientWidth || 1),
    Math.max(1, container?.clientHeight || 1),
    false,
  )
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  renderer.shadowMap.enabled = true
  renderer.domElement.dataset.renderer = 'three-webgl'
  return { renderer, canvas: renderer.domElement }
}

/**
 * Releases the Three.js WebGL application facade.
 *
 * @param {{renderer?:WebGLRenderer}|null|undefined} app Three application.
 * @returns {void}
 */
export function destroyThreeApplication(app) {
  if (!app?.renderer) return
  app.renderer.dispose()
  app.renderer.forceContextLoss?.()
}
