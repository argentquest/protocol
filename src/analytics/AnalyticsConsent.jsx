import { useEffect, useState } from 'react'
import {
  initializeGoogleAnalytics,
  normalizeMeasurementId,
  readAnalyticsConsent,
  saveAnalyticsConsent,
} from './googleAnalytics.js'

/**
 * Requests analytics consent and loads GA4 only after an affirmative choice.
 *
 * @param {{measurementId?: string}} props Analytics configuration.
 * @returns {import('react').JSX.Element|null} Consent notice when undecided.
 */
export default function AnalyticsConsent({
  measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID,
}) {
  const configuredId = normalizeMeasurementId(measurementId)
  const [consent, setConsent] = useState(readAnalyticsConsent)

  useEffect(() => {
    if (configuredId && consent === 'accepted') {
      initializeGoogleAnalytics(configuredId)
    }
  }, [configuredId, consent])

  if (!configuredId || consent !== null) return null

  /** @param {'accepted'|'declined'} decision Visitor consent choice. */
  const choose = (decision) => {
    saveAnalyticsConsent(decision)
    setConsent(decision)
  }

  return (
    <aside className="analytics-consent" aria-label="Analytics preference">
      <p>
        Path Protocol uses optional Google Analytics to understand aggregate
        visits and improve the game. Analytics stays off unless you accept.
        See the <a href={`${import.meta.env.BASE_URL}PRIVACY.html`}>privacy notice</a>.
      </p>
      <div className="analytics-consent__actions">
        <button type="button" className="text-button" onClick={() => choose('declined')}>
          Decline
        </button>
        <button type="button" className="primary-button" onClick={() => choose('accepted')}>
          Accept analytics
        </button>
      </div>
    </aside>
  )
}
