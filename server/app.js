import express from 'express'
import path from 'node:path'
import { access, mkdir } from 'node:fs/promises'
import { createAuthStore, SESSION_DURATION_MS } from './authStore.js'
import { createThemeStore } from './themeStore.js'
import { createMediaLibrary } from './mediaLibrary.js'
import {
  createAccountStorageQuota,
  DEFAULT_ACCOUNT_MEDIA_QUOTA_BYTES,
} from './accountStorageQuota.js'
import { createPersonalMediaStore } from './personalMediaStore.js'

const SESSION_COOKIE = 'path_protocol_session'

/**
 * Reads one decoded cookie value from an Express request.
 *
 * @pure
 * @param {import('express').Request} request Incoming request.
 * @param {string} name Cookie name.
 * @returns {string} Decoded value, or an empty string when absent.
 */
function cookieValue(request, name) {
  const cookies = String(request.get('cookie') ?? '').split(';')
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return ''
}

/**
 * Writes the HTTP-only authentication cookie with the session lifetime.
 *
 * @param {import('express').Response} response Outgoing response.
 * @param {string} token Opaque session credential.
 * @param {boolean} secure Whether to restrict transport to HTTPS.
 * @returns {void}
 */
function writeSessionCookie(response, token, secure) {
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    maxAge: SESSION_DURATION_MS,
    path: '/',
    sameSite: 'lax',
    secure,
  })
}

/**
 * Returns the authenticated request user or raises an HTTP 401 error.
 *
 * @param {import('express').Request & {user?: object}} request Incoming request.
 * @returns {object} Authenticated public user record.
 * @throws {Error} When the request has no authenticated session.
 */
function requireUser(request) {
  if (!request.user) {
    throw Object.assign(new Error('Login is required.'), { status: 401 })
  }
  return request.user
}

/** @param {import('express').Request & {user?: object}} request Incoming request. @returns {object} Authenticated administrator. */
function requireAdmin(request) {
  const user = requireUser(request)
  if (!user.isAdmin) {
    throw Object.assign(new Error('Site administrator access is required.'), {
      status: 403,
    })
  }
  return user
}

/**
 * Adapts an asynchronous route handler to Express error middleware.
 *
 * @param {(request: import('express').Request, response: import('express').Response) => Promise<unknown>} handler Asynchronous route implementation.
 * @returns {import('express').RequestHandler} Express-compatible handler.
 */
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
  personalMediaRoot = process.env.PATH_PROTOCOL_PERSONAL_MEDIA_ROOT ??
    path.join(path.dirname(path.resolve(dataDirectory)), 'user-media'),
  accountMediaQuotaBytes = Number(
    process.env.PATH_PROTOCOL_ACCOUNT_MEDIA_QUOTA_BYTES ??
      DEFAULT_ACCOUNT_MEDIA_QUOTA_BYTES,
  ),
  uploadLimits = {
    maxImageBytes: Number(
      process.env.PATH_PROTOCOL_MAX_UPLOAD_IMAGE_BYTES ?? 25 * 1024 * 1024,
    ),
    maxAudioBytes: Number(
      process.env.PATH_PROTOCOL_MAX_UPLOAD_AUDIO_BYTES ?? 100 * 1024 * 1024,
    ),
    maxImageDimension: Number(
      process.env.PATH_PROTOCOL_MAX_UPLOAD_IMAGE_DIMENSION ?? 4096,
    ),
    maxImagePixels: Number(
      process.env.PATH_PROTOCOL_MAX_UPLOAD_IMAGE_PIXELS ?? 16_777_216,
    ),
    maxAudioDurationSeconds: Number(
      process.env.PATH_PROTOCOL_MAX_UPLOAD_AUDIO_SECONDS ?? 300,
    ),
  },
} = {}) {
  if (databasePath !== ':memory:') {
    await mkdir(path.dirname(path.resolve(databasePath)), { recursive: true })
  }
  const authStore = createAuthStore({ databasePath, confirmEmail })
  const quota = createAccountStorageQuota({
    themesDirectory: path.resolve(dataDirectory),
    uploadsDirectory: path.resolve(personalMediaRoot),
    limitBytes: accountMediaQuotaBytes,
  })
  const personalMediaStore = await createPersonalMediaStore({
    root: personalMediaRoot,
    quota,
    ...uploadLimits,
  })
  const mediaLibrary = await createMediaLibrary({
    root: publicMediaLibraryRoot,
    personalMediaStore,
    quota,
  })
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
  app.locals.personalMediaStore = personalMediaStore

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true })
  })
  app.get('/api/auth/me', (request, response) => {
    response.json({ user: request.user })
  })
  app.get('/api/media-library', asyncRoute(async (request, response) => {
    const result = await mediaLibrary.list({
        kind: request.query.kind ?? 'image',
        collection: request.query.collection,
        folder: request.query.folder,
        query: request.query.query,
        offset: request.query.offset,
        limit: request.query.limit,
        userId: request.user?.id,
      })
    response.json({
      ...result,
      quota: request.user ? await quota.usage(request.user.id) : null,
    })
  }))
  app.post(
    '/api/media-library/uploads',
    asyncRoute(async (request, response) => {
      const user = requireUser(request)
      response.status(201).json(
        await personalMediaStore.upload(request, user, request.query.kind),
      )
    }),
  )
  app.delete(
    '/api/media-library/uploads/:assetId',
    asyncRoute(async (request, response) => {
      const user = requireUser(request)
      response.json({
        quota: await personalMediaStore.remove(
          user.id,
          `uploads/${request.params.assetId}`,
        ),
      })
    }),
  )
  app.get(
    '/api/media-library/file',
    asyncRoute(async (request, response) => {
      const entry = await mediaLibrary.resolveEntry(
        request.query.assetId,
        null,
        request.user?.id,
      )
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
  app.get(
    '/api/admin/themes',
    asyncRoute(async (request, response) => {
      requireAdmin(request)
      const themes = await store.listAllThemes()
      response.json({
        themes: themes.map((theme) => ({
          ...theme,
          owner: theme.ownerUserId
            ? authStore.getPublicUser(theme.ownerUserId)
            : null,
        })),
      })
    }),
  )
  app.patch(
    '/api/admin/themes/:themeId',
    asyncRoute(async (request, response) => {
      const admin = requireAdmin(request)
      if (typeof request.body?.disabled !== 'boolean') {
        throw Object.assign(new Error('disabled must be a boolean.'), {
          status: 400,
        })
      }
      response.json(
        await store.setDisabled(
          request.params.themeId,
          request.body.disabled,
          admin.id,
        ),
      )
    }),
  )
  app.delete(
    '/api/admin/themes/:themeId',
    asyncRoute(async (request, response) => {
      requireAdmin(request)
      await store.deleteThemeAsAdmin(request.params.themeId)
      response.status(204).end()
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
      response.json(
        await store.getTheme(
          request.params.themeId,
          request.user?.id,
          request.user?.isAdmin,
        ),
      )
    }),
  )
  app.get(
    '/api/themes/:themeId/campaign',
    asyncRoute(async (request, response) => {
      response.json(
        await store.getCampaign(
          request.params.themeId,
          request.user?.id,
          request.user?.isAdmin,
        ),
      )
    }),
  )
  app.get(
    '/api/themes/:themeId/media-manifest',
    asyncRoute(async (request, response) => {
      response.json(
        await store.getMediaManifest(
          request.params.themeId,
          request.user?.id,
          request.user?.isAdmin,
        ),
      )
    }),
  )
  app.get(
    '/api/themes/:themeId/media-file/:fileName',
    asyncRoute(async (request, response) => {
      response.sendFile(
        await store.resolveMediaFile(
          request.params.themeId,
          request.user?.id,
          request.query.path,
          request.user?.isAdmin,
        ),
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
          request.user?.isAdmin,
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
  app.post(
    '/api/themes/:themeId/media/entity-overrides',
    asyncRoute(async (request, response) => {
      response.status(201).json(
        await store.setEntityMediaOverride(
          request.params.themeId,
          requireUser(request).id,
          request.body ?? {},
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
  app.post(
    '/api/themes/:themeId/levels/validate',
    asyncRoute(async (request, response) => {
      const theme = await store.getTheme(
        request.params.themeId,
        requireUser(request).id,
      )
      if (!theme.canEdit) {
        throw Object.assign(new Error('Login as the theme owner to edit it.'), {
          status: 403,
        })
      }
      response.json(store.validateLevel(request.body))
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
          /**
           * Prevents caching the HTML shell while allowing versioned assets to cache.
           *
           * @param {import('express').Response} response Static-file response.
           * @param {string} filePath Served file path.
           * @returns {void}
           */
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
      code: error.code,
      quota: error.quota,
    })
  })
  return app
}
