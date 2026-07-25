const defaultPhases = [
  { id: 'configuration', label: 'Validating configuration', weight: 1 },
  { id: 'manifest', label: 'Resolving theme media', weight: 1 },
  { id: 'visuals', label: 'Loading vector media', weight: 6 },
  { id: 'audio', label: 'Loading audio', weight: 2 },
]

export function createStartupProgressReporter(
  onProgress = () => {},
  phases = defaultPhases,
) {
  const progress = new Map(phases.map((phase) => [phase.id, 0]))
  const totalWeight = phases.reduce((total, phase) => total + phase.weight, 0)

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

export async function loadStartupMedia({
  themeName,
  fetchManifest,
  loadVisual,
  loadAudio,
  validateConfiguration,
  onProgress,
}) {
  const reporter = createStartupProgressReporter(onProgress)
  await validateConfiguration()
  reporter.report('configuration', 1)
  const manifest = await fetchManifest(`/media/manifests/${themeName}.json`)
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
