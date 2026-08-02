import { Assets, GraphicsContext } from 'pixi.js'

/**
 * Loads each resolved vector or texture source once and reuses its Pixi resource.
 */
export class VectorAssetCache {
  /**
   * @param {object} [options] Cache dependencies.
   * @param {(url: string) => Promise<string>} [options.fetchText] SVG source loader.
   * @param {(url: string) => Promise<object>} [options.loadTexture] PNG texture loader.
   * @param {typeof GraphicsContext} [options.GraphicsContextClass] Pixi context constructor.
   */
  constructor({
    fetchText,
    loadTexture = (url) => Assets.load(url),
    GraphicsContextClass = GraphicsContext,
  } = {}) {
    this.fetchText =
      fetchText ??
      (async (url) => {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Unable to load vector asset ${url}.`)
        return response.text()
      })
    this.GraphicsContextClass = GraphicsContextClass
    this.loadTexture = loadTexture
    this.bySource = new Map()
    this.byMediaId = new Map()
  }

  /**
   * Loads one visual-media definition and registers its media ID.
   *
   * @param {{src: string, mediaId: string}} definition Resolved media definition.
   * @returns {Promise<object>} Parsed vector context or loaded texture.
   */
  async load(definition) {
    const renderMode = definition.renderMode ?? 'vector'
    const sourceKey = `${renderMode}:${definition.src}`
    let promise = this.bySource.get(sourceKey)
    if (!promise) {
      promise =
        renderMode === 'texture'
          ? Promise.resolve(this.loadTexture(definition.src))
          : this.fetchText(definition.src).then((svg) =>
              new this.GraphicsContextClass().svg(svg),
            )
      this.bySource.set(sourceKey, promise)
    }
    this.byMediaId.set(definition.mediaId, promise)
    return promise
  }

  /**
   * Preloads every visual entry in a resolved theme manifest.
   *
   * @param {{visuals: object[]}} manifest Resolved media manifest.
   * @returns {Promise<VectorAssetCache>} This populated cache.
   */
  async loadManifest(manifest) {
    await Promise.all(
      manifest.visuals.map((asset) => this.load(asset)),
    )
    return this
  }

  /**
   * Retrieves a preloaded visual resource by stable media ID.
   *
   * @param {string} mediaId Stable theme-neutral media ID.
   * @returns {Promise<object>} Parsed vector context or loaded texture.
   */
  async get(mediaId) {
    const context = this.byMediaId.get(mediaId)
    if (!context) throw new Error(`Visual media "${mediaId}" was not loaded.`)
    return context
  }

  /** Removes all parsed contexts and media-ID aliases. */
  clear() {
    this.bySource.clear()
    this.byMediaId.clear()
  }
}

export const sharedVectorAssetCache = new VectorAssetCache()
