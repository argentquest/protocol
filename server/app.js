import express from 'express'
import path from 'node:path'
import { access, mkdir } from 'node:fs/promises'
import { createAuthStore, SESSION_DURATION_MS } from './authStore.js'
import { createThemeStore } from './themeStore.js'
import { createMediaLibrary } from './mediaLibrary.js'

const SESSION_COOKIE = 'path_protocol_session'

function cookieValue(request, name) {
  const cookies = String(request.get('cookie') ?? '').split(';')
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return ''
}

function writeSessionCookie(response, token, secure) {
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    maxAge: SESSION_DURATION_MS,
    path: '/',
    sameSite: 'lax',
    secure,
  })
}

function requireUser(request) {
  if (!request.user) {
    throw Object.assign(new Error('Login is required.'), { status: 401 })
  }
  return request.user
}

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response)).catch(next)
  }
}

/**
 * Creates the Node application serving Theme Workshop APIs and production UI.
 *
 * @param {object} options Runtime paths.
 * @returns {Promise<import('express').Express>} Configured Express application.
 */
export async function createServerApp({
  repositoryRoot = path.resolve('.'),
  dataDirectory = process.env.PATH_PROTOCOL_DATA_DIR ??
    path.join(repositoryRoot, 'data', 'themes'),
  databasePath = process.env.PATH_PROTOCOL_DB_PATH ??
    path.join(repositoryRoot, 'data', 'path-protocol.sqlite'),
  confirmEmail = false,
  secureCookies = process.env.PATH_PROTOCOL_SECURE_COOKIES === '1',
  serveFrontend = true,
  publicMediaLibraryRoot =
    process.env.PATH_PROTOCOL_MEDIA_LIBRARY_ROOT ??
    path.join(repositoryRoot, 'PublicMedia'),
} = {}) {
  if (databasePath !== ':memory:') {
    await mkdir(path.dirname(path.resolve(databasePath)), { recursive: true })
  }
  const authStore = createAuthStore({ databasePath, confirmEmail })
  const mediaLibrary = await createMediaLibrary({ root: publicMediaLibraryRoot })
  const store = await createThemeStore({
    dataDirectory: path.resolve(dataDirectory),
    defaultLevelsDirectory: path.join(repositoryRoot, 'src', 'config', 'levels'),
    levelSchemaPath: path.join(
      repositoryRoot,
      'src',
      'config',
      'schemas',
      'level.schema.json',
    ),
    mediaRegistryPath: path.join(repositoryRoot, 'src', 'config', 'mediaRegistry.json'),
    soundRegistryPath: path.join(repositoryRoot, 'src', 'config', 'soundRegistry.json'),
    defaultMediaDirectory: path.join(repositoryRoot, 'public', 'media', 'default'),
    defaultAudioSettingsPath: path.join(
      repositoryRoot,
      'public',
      'media',
      'default',
      'audio.json',
    ),
    mediaLibrary,
  })
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '2mb' }))
  app.use((request, _response, next) => {
    request.sessionToken = cookieValue(request, SESSION_COOKIE)
    request.user = authStore.sessionUser(request.sessionToken)
    next()
  })
  app.locals.authStore = authStore
  app.locals.themeStore = store

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true })
  })
  app.get('/api/auth/me', (request, response) => {
    response.json({ user: request.user })
  })
  app.get('/api/media-library', (request, response) => {
    response.json(
      mediaLibrary.list({
        kind: request.query.kind ?? 'image',
        query: request.query.query,
        offset: request.query.offset,
        limit: request.query.limit,
      }),
    )
  })
  app.get(
    '/api/media-library/file',
    asyncRoute(async (request, response) => {
      const entry = mediaLibrary.resolveEntry(request.query.assetId)
      response.sendFile(entry.absolutePath)
    }),
  )
  app.post(
    '/api/auth/register',
    asyncRoute(async (request, response) => {
      const result = await authStore.register(request.body ?? {})
      writeSessionCookie(response, result.session.token, secureCookies)
      response.status(201).json({ user: result.user })
    }),
  )
  app.post(
    '/api/auth/login',
    asyncRoute(async (request, response) => {
      const result = await authStore.login(request.body ?? {})
      writeSessionCookie(response, result.session.token, secureCookies)
      response.json({ user: result.user })
    }),
  )
  app.post('/api/auth/logout', (request, response) => {
    authStore.logout(request.sessionToken)
    response.clearCookie(SESSION_COOKIE, { path: '/', sameSite: 'lax' })
    response.status(204).end()
  })
  app.get(
    '/api/themes',
    asyncRoute(async (_request, response) => {
      response.json({ themes: await store.listPublicThemes() })
    }),
  )
  app.get(
    '/api/themes/mine',
    asyncRoute(async (request, response) => {
      const user = requireUser(request)
      response.json({ themes: await store.listOwnedThemes(user.id) })
    }),
  )
  app.post(
    '/api/themes',
    asyncRoute(async (request, response) => {
      const user = requireUser(request)
      response.status(201).json(await store.cloneTheme(request.body ?? {}, user.id))
    }),
  )
  app.get(
    '/api/themes/:themeId',
    asyncRoute(async (request, response) => {
      response.json(await store.getTheme(request.params.themeId, request.user?.id))
    }),
  )
  app.get(
    '/api/themes/:themeId/campaign',
    asyncRoute(async (request, response) => {
      response.json(
        await store.getCampaign(request.params.themeId, request.user?.id),
      )
    }),
  )
  app.get(
    '/api/themes/:themeId/media-manifest',
    asyncRoute(async (request, response) => {
      response.json(
        await store.getMediaManifest(request.params.themeId, request.user?.id),
      )
    }),
  )
  app.get(
    '/api/themes/:themeId/media-file',
    asyncRoute(async (request, response) => {
      response.sendFile(
        await store.resolveMediaFile(
          request.params.themeId,
          request.user?.id,
          request.query.path,
        ),
      )
    }),
  )
  app.put(
    '/api/themes/:themeId/media/visuals/:mediaId',
    asyncRoute(async (request, response) => {
      response.json(
        await store.setVisualMedia(
          request.params.themeId,
          requireUser(request).id,
          request.params.mediaId,
          request.body?.assetId,
        ),
      )
    }),
  )
  app.put(
    '/api/themes/:themeId/media/audio/:soundId',
    asyncRoute(async (request, response) => {
      response.json(
        await store.setAudioMedia(
          request.params.themeId,
          requireUser(request).id,
          request.params.soundId,
          request.body?.assetId,
        ),
      )
    }),
  )
  app.patch(
    '/api/themes/:themeId',
    asyncRoute(async (request, response) => {
      response.json(
        await store.setPublished(
          request.params.themeId,
          requireUser(request).id,
          request.body?.public,
        ),
      )
    }),
  )
  app.delete(
    '/api/themes/:themeId',
    asyncRoute(async (request, response) => {
      await store.deleteTheme(request.params.themeId, requireUser(request).id)
      response.status(204).end()
    }),
  )
  app.get(
    '/api/themes/:themeId/levels/:internalId',
    asyncRoute(async (request, response) => {
      response.json(
        await store.getLevel(
          request.params.themeId,
          request.params.internalId,
          request.user?.id,
        ),
      )
    }),
  )
  app.put(
    '/api/themes/:themeId/levels/:internalId',
    asyncRoute(async (request, response) => {
      response.json(
        await store.saveLevel(
          request.params.themeId,
          request.params.internalId,
          requireUser(request).id,
          request.body,
        ),
      )
    }),
  )
  app.post(
    '/api/themes/:themeId/levels',
    asyncRoute(async (request, response) => {
      response.status(201).json(
        await store.addLevel(
          request.params.themeId,
          requireUser(request).id,
          request.body?.sourceInternalId,
        ),
      )
    }),
  )
  app.put(
    '/api/themes/:themeId/level-order',
    asyncRoute(async (request, response) => {
      response.json(
        await store.reorderLevels(
          request.params.themeId,
          requireUser(request).id,
          request.body?.order,
        ),
      )
    }),
  )
  app.delete(
    '/api/themes/:themeId/levels/:internalId',
    asyncRoute(async (request, response) => {
      response.json(
        await store.deleteLevel(
          request.params.themeId,
          request.params.internalId,
          requireUser(request).id,
        ),
      )
    }),
  )

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'API endpoint not found.' })
  })

  if (serveFrontend) {
    const distributionDirectory = path.join(repositoryRoot, 'dist')
    try {
      await access(path.join(distributionDirectory, 'index.html'))
      app.use(
        express.static(distributionDirectory, {
          setHeaders(response, filePath) {
            const normalized = filePath.replaceAll('\\', '/')
            if (normalized.includes('/media/manifests/')) {
              response.setHeader('cache-control', 'no-cache')
            } else if (
              normalized.includes('/assets/') ||
              normalized.includes('/media/')
            ) {
              response.setHeader(
                'cache-control',
                'public, max-age=31536000, immutable',
              )
            }
          },
        }),
      )
      app.use((request, response, next) => {
        if (request.method !== 'GET' || request.path.startsWith('/api/')) {
          next()
          return
        }
        response.sendFile(path.join(distributionDirectory, 'index.html'))
      })
    } catch {
      // API-only development mode is valid before a production build exists.
    }
  }

  app.use((error, _request, response, _next) => {
    response.status(error.status ?? 500).json({
      error: error.message ?? 'Unexpected server error.',
      details: error.details ?? [],
    })
  })
  return app
}
