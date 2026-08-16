const CONSENT_STORAGE_KEY = 'path-protocol.analytics-consent'
const SCRIPT_ELEMENT_ID = 'path-protocol-google-analytics'
const VALID_MEASUREMENT_ID = /^G-[A-Z0-9]+$/

/** @typedef {'accepted'|'declined'|null} AnalyticsConsent */

/**
 * Returns a validated public GA4 measurement ID.
 *
 * @param {unknown} value Candidate measurement ID.
 * @returns {string} Valid ID or an empty string when analytics is unconfigured.
 */
export function normalizeMeasurementId(value) {
  const measurementId = String(value ?? '').trim().toUpperCase()
  return VALID_MEASUREMENT_ID.test(measurementId) ? measurementId : ''
}

/**
 * Reads the visitor's browser-local analytics choice.
 *
 * @param {Storage} [storage] Browser storage implementation.
 * @returns {AnalyticsConsent} Saved consent state.
 */
export function readAnalyticsConsent(storage = window.localStorage) {
  const value = storage.getItem(CONSENT_STORAGE_KEY)
  return value === 'accepted' || value === 'declined' ? value : null
}

/**
 * Persists the visitor's browser-local analytics choice.
 *
 * @param {'accepted'|'declined'} consent Consent decision.
 * @param {Storage} [storage] Browser storage implementation.
 * @returns {void}
 */
export function saveAnalyticsConsent(consent, storage = window.localStorage) {
  if (consent !== 'accepted' && consent !== 'declined') return
  storage.setItem(CONSENT_STORAGE_KEY, consent)
}

/**
 * Loads GA4 after consent and configures one page view for the current URL.
 * Calling the function more than once is safe.
 *
 * @param {string} candidateId Public GA4 measurement ID.
 * @param {Document} [documentObject] Browser document.
 * @param {Window} [windowObject] Browser window.
 * @returns {boolean} Whether analytics is configured.
 */
export function initializeGoogleAnalytics(
  candidateId,
  documentObject = document,
  windowObject = window,
) {
  const measurementId = normalizeMeasurementId(candidateId)
  if (!measurementId) return false

  windowObject.dataLayer = windowObject.dataLayer || []
  windowObject.gtag =
    windowObject.gtag ||
    /** Queues GA4 commands until the remote library is ready. */
    function gtag() {
      windowObject.dataLayer.push(arguments)
    }

  if (!documentObject.getElementById(SCRIPT_ELEMENT_ID)) {
    const script = documentObject.createElement('script')
    script.id = SCRIPT_ELEMENT_ID
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
    documentObject.head.append(script)
  }

  if (!windowObject.__pathProtocolAnalyticsConfigured) {
    windowObject.gtag('js', new Date())
    windowObject.gtag('config', measurementId)
    windowObject.__pathProtocolAnalyticsConfigured = true
  }
  return true
}

export const analyticsConsentStorageKey = CONSENT_STORAGE_KEY
