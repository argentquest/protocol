import { GraphicsContext } from 'pixi.js'

export class VectorAssetCache {
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

  async loadManifest(manifest) {
    await Promise.all(
      manifest.visuals
        .filter((asset) => asset.renderMode === 'vector')
        .map((asset) => this.load(asset)),
    )
    return this
  }

  async get(mediaId) {
    const context = this.byMediaId.get(mediaId)
    if (!context) throw new Error(`Vector media "${mediaId}" was not loaded.`)
    return context
  }

  clear() {
    this.bySource.clear()
    this.byMediaId.clear()
  }
}

export const sharedVectorAssetCache = new VectorAssetCache()
