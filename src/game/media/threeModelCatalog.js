import catalog from '../../config/generated/threeMediaManifest.json'

const modelById = new Map(catalog.models.map((entry) => [entry.modelId, entry]))

/** @returns {object} Immutable generated 3D model catalog. */
export function getThreeModelCatalog() {
  return catalog
}

/**
 * Resolves one registered 3D model.
 *
 * @pure
 * @param {string|null|undefined} modelId Stable model ID.
 * @returns {object|null} Catalog entry or null.
 */
export function getThreeModel(modelId) {
  return modelById.get(modelId) ?? null
}

/**
 * Resolves the optional implicit model for a gameplay presentation role.
 * Obstacles and terrain stay procedural unless explicitly authored so their
 * visuals continue to match arbitrary JSON collision dimensions.
 *
 * @pure
 * @param {string} role Renderer entity role.
 * @returns {string|null} Default model ID or null.
 */
export function defaultModelForRole(role) {
  if (role === 'token') return catalog.defaults.token
  if (role === 'target') return catalog.defaults.target
  if (role === 'ramp') return catalog.defaults.ramp
  return null
}

/**
 * Builds a Vite-base-aware URL for a generated catalog asset.
 *
 * @pure
 * @param {string} relativePath Manifest-relative public path.
 * @param {string} [baseUrl=import.meta.env.BASE_URL] Vite deployment base.
 * @returns {string} Runtime URL.
 */
export function threeAssetUrl(
  relativePath,
  baseUrl = import.meta.env.BASE_URL,
) {
  const base = String(baseUrl ?? '')
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  return `${normalizedBase}${String(relativePath).replace(/^\/+/, '')}`
}
