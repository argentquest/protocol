import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import AnalyticsConsent from './AnalyticsConsent.jsx'
import {
  analyticsConsentStorageKey,
  initializeGoogleAnalytics,
  normalizeMeasurementId,
} from './googleAnalytics.js'

describe('Google Analytics consent', () => {
  beforeEach(() => {
    window.localStorage.clear()
    delete window.gtag
    delete window.dataLayer
    delete window.__pathProtocolAnalyticsConfigured
    document.getElementById('path-protocol-google-analytics')?.remove()
  })

  afterEach(cleanup)

  it('rejects invalid measurement IDs', () => {
    expect(normalizeMeasurementId('UA-123')).toBe('')
    expect(initializeGoogleAnalytics('not-an-id')).toBe(false)
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull()
  })

  it('does not load Google Analytics before the visitor accepts', () => {
    render(createElement(AnalyticsConsent, { measurementId: 'G-2ZWLL7P02J' }))

    expect(screen.getByLabelText(/analytics preference/i)).toBeInTheDocument()
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull()
  })

  it('persists acceptance and loads the configured GA4 tag once', () => {
    render(createElement(AnalyticsConsent, { measurementId: 'G-2ZWLL7P02J' }))
    fireEvent.click(screen.getByRole('button', { name: /accept analytics/i }))

    expect(window.localStorage.getItem(analyticsConsentStorageKey)).toBe('accepted')
    expect(document.querySelectorAll('script[src*="G-2ZWLL7P02J"]')).toHaveLength(1)
    expect(window.dataLayer).toHaveLength(2)
    initializeGoogleAnalytics('G-2ZWLL7P02J')
    expect(document.querySelectorAll('script[src*="G-2ZWLL7P02J"]')).toHaveLength(1)
    expect(window.dataLayer).toHaveLength(2)
  })

  it('persists a decline without loading Google Analytics', () => {
    render(createElement(AnalyticsConsent, { measurementId: 'G-2ZWLL7P02J' }))
    fireEvent.click(screen.getByRole('button', { name: /decline/i }))

    expect(window.localStorage.getItem(analyticsConsentStorageKey)).toBe('declined')
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull()
  })
})
