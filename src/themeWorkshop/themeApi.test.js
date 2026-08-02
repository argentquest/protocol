import { afterEach, describe, expect, it, vi } from 'vitest'
import { authApi } from './themeApi.js'

describe('Theme Workshop API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns actionable feedback when an HTML page answers an API call', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<!DOCTYPE html><title>Path Protocol</title>', {
          status: 404,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      ),
    )

    await expect(
      authApi.login({ login: 'player', password: 'password' }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('npm run dev'),
      status: 404,
    })
  })

  it('preserves structured JSON errors from the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Invalid login or password.' }), {
          status: 401,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        }),
      ),
    )

    await expect(
      authApi.login({ login: 'player', password: 'incorrect' }),
    ).rejects.toMatchObject({
      message: 'Invalid login or password.',
      status: 401,
    })
  })
})
