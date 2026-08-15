const defaultPhases = [
  { id: 'configuration', label: 'Validating configuration', weight: 1 },
  { id: 'manifest', label: 'Resolving theme media', weight: 1 },
  { id: 'visuals', label: 'Loading visual media', weight: 6 },
  { id: 'audio', label: 'Loading audio', weight: 2 },
]

/**
 * Normalizes a root-relative deployment prefix.
 *
 * @param {string} value Deployment base path.
 * @returns {string} Base path with leading and trailing slashes.
 */
function normalizeBaseUrl(value) {
  const path = String(value || '/').trim()
  if (path === '/') return '/'
  return `/${path.replace(/^\/+|\/+$/g, '')}/`
}

/**
 * Rewrites a root-relative asset beneath a normalized deployment prefix.
 *
 * @pure
 * @param {string} source Asset URL.
 * @param {string} baseUrl Deployment prefix with boundary slashes.
 * @returns {string} Deployment-safe asset URL.
 */
function resolveAssetUrl(source, baseUrl) {
  if (typeof source !== 'string' || !source.startsWith('/')) return source
  return `${baseUrl}${source.slice(1)}`
}

/**
 * Rewrites root-relative manifest sources beneath a configured deployment
 * prefix while preserving external and already-relative URLs.
 *
 * @param {object} manifest Resolved media manifest.
 * @param {string} requestedBaseUrl Deployment base path.
 * @returns {object} Manifest whose runtime URLs match the deployed location.
 */
export function resolveManifestUrls(manifest, requestedBaseUrl = '/') {
  const baseUrl = normalizeBaseUrl(requestedBaseUrl)
  if (baseUrl === '/') return manifest
  return {
    ...manifest,
    visuals: manifest.visuals.map((entry) => ({
      ...entry,
      src: resolveAssetUrl(entry.src, baseUrl),
    })),
    audio: manifest.audio.map((entry) => ({
      ...entry,
      sources: entry.sources.map((source) =>
        resolveAssetUrl(source, baseUrl),
      ),
    })),
  }
}

/**
 * Creates a weighted reporter for startup phase completion.
 *
 * @param {(snapshot: object) => void} onProgress Progress subscriber.
 * @param {object[]} phases Weighted startup phase definitions.
 * @returns {{report: (phaseId: string, phaseProgress: number) => object}} Reporter.
 */
export function createStartupProgressReporter(
  onProgress = () => {},
  phases = defaultPhases,
) {
  const progress = new Map(phases.map((phase) => [phase.id, 0]))
  const totalWeight = phases.reduce((total, phase) => total + phase.weight, 0)

  /**
   * Aggregates weighted phase progress into a single startup fraction.
   *
   * @param {string} phaseId Startup phase ID.
   * @param {number} phaseProgress Phase completion from 0 to 1.
   * @returns {void}
   */
  function report(phaseId, phaseProgress) {
    const phase = phases.find((candidate) => candidate.id === phaseId)
    if (!phase) throw new Error(`Unknown startup phase "${phaseId}"`)
    progress.set(phaseId, Math.max(0, Math.min(1, phaseProgress)))
    const completedWeight = phases.reduce(
      (total, candidate) =>
        total + candidate.weight * (progress.get(candidate.id) ?? 0),
      0,
    )
    const snapshot = {
      phase: phase.id,
      label: phase.label,
      progress: completedWeight / totalWeight,
      percentage: Math.round((completedWeight / totalWeight) * 100),
    }
    onProgress(snapshot)
    return snapshot
  }

  return { report }
}

/**
 * Validates configuration and preloads resolved visual and audio media.
 *
 * @param {object} options Startup loader dependencies.
 * @returns {Promise<object>} Loaded resolved media manifest.
 */
export async function loadStartupMedia({
  themeName,
  fetchManifest,
  loadVisual,
  loadAudio,
  validateConfiguration,
  onProgress,
  baseUrl = '/',
}) {
  const reporter = createStartupProgressReporter(onProgress)
  await validateConfiguration()
  reporter.report('configuration', 1)
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const fetchedManifest = await fetchManifest(
    `${normalizedBaseUrl}media/manifests/${themeName}.json`,
  )
  const manifest = resolveManifestUrls(fetchedManifest, normalizedBaseUrl)
  reporter.report('manifest', 1)

  const visualCount = Math.max(1, manifest.visuals.length)
  for (let index = 0; index < manifest.visuals.length; index += 1) {
    await loadVisual(manifest.visuals[index])
    reporter.report('visuals', (index + 1) / visualCount)
  }
  if (manifest.visuals.length === 0) reporter.report('visuals', 1)

  const audioCount = Math.max(1, manifest.audio.length)
  for (let index = 0; index < manifest.audio.length; index += 1) {
    await loadAudio(manifest.audio[index])
    reporter.report('audio', (index + 1) / audioCount)
  }
  if (manifest.audio.length === 0) reporter.report('audio', 1)
  return manifest
}
