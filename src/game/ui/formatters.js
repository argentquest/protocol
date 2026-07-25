export function formatTime(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)}s`
}

export function formatDistance(value) {
  return `${Math.round(value)}u`
}
