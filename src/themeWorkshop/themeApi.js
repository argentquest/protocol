/**
 * Reads an API response without assuming an HTML error page is JSON.
 *
 * @param {Response} response Fetch response from the same-origin API.
 * @returns {Promise<object|null>} Parsed response payload.
 */
async function readApiPayload(response) {
  if (response.status === 204) return null
  const contentType = response.headers.get('content-type') ?? ''
  const text = await response.text()
  if (!contentType.includes('application/json')) {
    const error = new Error(
      'Theme Workshop API is unavailable. Start the full application with "npm run dev" and try again.',
    )
    error.status = response.status
    throw error
  }
  try {
    return text ? JSON.parse(text) : null
  } catch {
    const error = new Error('Theme Workshop API returned invalid JSON.')
    error.status = response.status
    throw error
  }
}

/**
 * Sends a same-origin Theme Workshop API request.
 *
 * @param {string} path Root-relative API path.
 * @param {RequestInit & {body?: unknown}} [options] Fetch options and JSON body.
 * @returns {Promise<object|null>} Successful response payload.
 */
async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers)
  if (options.body !== undefined) headers.set('content-type', 'application/json')
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers,
    body:
      options.body === undefined || typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body),
  })
  const payload = await readApiPayload(response)
  if (!response.ok) {
    const error = new Error(payload?.error ?? 'Server request failed.')
    error.details = payload?.details ?? []
    error.status = response.status
    throw error
  }
  return payload
}

/** Same-origin account operations backed by an HTTP-only session cookie. */
export const authApi = {
  me: () => apiRequest('/api/auth/me'),
  register: (body) => apiRequest('/api/auth/register', { method: 'POST', body }),
  login: (body) => apiRequest('/api/auth/login', { method: 'POST', body }),
  logout: () => apiRequest('/api/auth/logout', { method: 'POST' }),
}

/** Theme Workshop persistence operations for the current account. */
export const themeApi = {
  list: () => apiRequest('/api/themes'),
  mine: () => apiRequest('/api/themes/mine'),
  clone: (body) => apiRequest('/api/themes', { method: 'POST', body }),
  get: (themeId) => apiRequest(`/api/themes/${themeId}`),
  campaign: (themeId) => apiRequest(`/api/themes/${themeId}/campaign`),
  mediaManifest: (themeId) =>
    apiRequest(`/api/themes/${themeId}/media-manifest`),
  setVisualMedia: (themeId, mediaId, assetId) =>
    apiRequest(`/api/themes/${themeId}/media/visuals/${mediaId}`, {
      method: 'PUT',
      body: { assetId },
    }),
  setAudioMedia: (themeId, soundId, assetId) =>
    apiRequest(`/api/themes/${themeId}/media/audio/${soundId}`, {
      method: 'PUT',
      body: { assetId },
    }),
  setEntityMediaOverride: (themeId, body) =>
    apiRequest(`/api/themes/${themeId}/media/entity-overrides`, {
      method: 'POST',
      body,
    }),
  level: (themeId, internalId) =>
    apiRequest(`/api/themes/${themeId}/levels/${internalId}`),
  saveLevel: (themeId, internalId, level) =>
    apiRequest(`/api/themes/${themeId}/levels/${internalId}`, {
      method: 'PUT',
      body: level,
    }),
  validateLevel: (themeId, level) =>
    apiRequest(`/api/themes/${themeId}/levels/validate`, {
      method: 'POST',
      body: level,
    }),
  addLevel: (themeId, sourceInternalId) =>
    apiRequest(`/api/themes/${themeId}/levels`, {
      method: 'POST',
      body: { sourceInternalId },
    }),
  reorder: (themeId, order) =>
    apiRequest(`/api/themes/${themeId}/level-order`, {
      method: 'PUT',
      body: { order },
    }),
  deleteLevel: (themeId, internalId) =>
    apiRequest(`/api/themes/${themeId}/levels/${internalId}`, {
      method: 'DELETE',
    }),
  publish: (themeId, published) =>
    apiRequest(`/api/themes/${themeId}`, {
      method: 'PATCH',
      body: { public: published },
    }),
  deleteTheme: (themeId) =>
    apiRequest(`/api/themes/${themeId}`, { method: 'DELETE' }),
}

/** Read-only PublicMedia catalog operations for authenticated theme authors. */
export const mediaLibraryApi = {
  list: ({
    kind,
    collection = '',
    folder = null,
    query = '',
    offset = 0,
    limit = 60,
  }) => {
    const parameters = new URLSearchParams({
      kind,
      collection,
      query,
      offset: String(offset),
      limit: String(limit),
    })
    if (folder !== null) parameters.set('folder', folder)
    return apiRequest(`/api/media-library?${parameters}`)
  },
  fileUrl: (assetId) =>
    `/api/media-library/file?assetId=${encodeURIComponent(assetId)}`,
}
