import { GraphicsContext } from 'pixi.js'

/**
 * Loads each resolved SVG source once and reuses its parsed Pixi context.
 */
export class VectorAssetCache {
  /**
   * @param {object} [options] Cache dependencies.
   * @param {(url: string) => Promise<string>} [options.fetchText] SVG source loader.
   * @param {typeof GraphicsContext} [options.GraphicsContextClass] Pixi context constructor.
   */
  constructor({ fetchText, GraphicsContextClass = GraphicsContext } = {}) {
    this.fetchText =
      fetchText ??
      (async (url) => {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Unable to load vector asset ${url}.`)
        return response.text()
      })
    this.GraphicsContextClass = GraphicsContextClass
    this.bySource = new Map()
    this.byMediaId = new Map()
  }

  /**
   * Loads one vector-media definition and registers its media ID.
   *
   * @param {{src: string, mediaId: string}} definition Resolved media definition.
   * @returns {Promise<GraphicsContext>} Parsed reusable vector context.
   */
  async load(definition) {
    let promise = this.bySource.get(definition.src)
    if (!promise) {
      promise = this.fetchText(definition.src).then((svg) =>
        new this.GraphicsContextClass().svg(svg),
      )
      this.bySource.set(definition.src, promise)
    }
    this.byMediaId.set(definition.mediaId, promise)
    return promise
  }

  /**
   * Preloads all vector entries in a resolved theme manifest.
   *
   * @param {{visuals: object[]}} manifest Resolved media manifest.
   * @returns {Promise<VectorAssetCache>} This populated cache.
   */
  async loadManifest(manifest) {
    await Promise.all(
      manifest.visuals
        .filter((asset) => asset.renderMode === 'vector')
        .map((asset) => this.load(asset)),
    )
    return this
  }

  /**
   * Retrieves a preloaded context by stable media ID.
   *
   * @param {string} mediaId Stable theme-neutral media ID.
   * @returns {Promise<GraphicsContext>} Parsed vector context.
   */
  async get(mediaId) {
    const context = this.byMediaId.get(mediaId)
    if (!context) throw new Error(`Vector media "${mediaId}" was not loaded.`)
    return context
  }

  /** Removes all parsed contexts and media-ID aliases. */
  clear() {
    this.bySource.clear()
    this.byMediaId.clear()
  }
}

export const sharedVectorAssetCache = new VectorAssetCache()
