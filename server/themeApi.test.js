// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import request from 'supertest'
import { createServerApp } from './app.js'

async function register(agent, username = 'themeowner') {
  return agent.post('/api/auth/register').send({
    username,
    email: `${username}@example.test`,
    password: 'correct-horse-42',
  })
}

describe('accounts and Theme Workshop API', () => {
  let dataRoot
  let themesDirectory
  let mediaLibraryDirectory
  let app

  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(os.tmpdir(), 'path-protocol-data-'))
    themesDirectory = path.join(dataRoot, 'themes')
    mediaLibraryDirectory = path.join(dataRoot, 'PublicMedia')
    await mkdir(path.join(mediaLibraryDirectory, 'images'), { recursive: true })
    await mkdir(path.join(mediaLibraryDirectory, 'audio'), { recursive: true })
    await writeFile(
      path.join(mediaLibraryDirectory, 'catalog.json'),
      JSON.stringify({
        schemaVersion: 1,
        collections: {
          images: { license: 'CC0-1.0', sourceUrl: 'https://example.test/images' },
          audio: { license: 'CC0-1.0', sourceUrl: 'https://example.test/audio' },
        },
      }),
    )
    await copyFile(
      path.resolve(
        'public/media/themes/celestial-foundry/tokens/token-circle.png',
      ),
      path.join(mediaLibraryDirectory, 'images', 'token.png'),
    )
    await copyFile(
      path.resolve('PublicMedia/wobbleboxx-soundpack01/Coin01.aif'),
      path.join(mediaLibraryDirectory, 'audio', 'coin.aif'),
    )
    app = await createServerApp({
      repositoryRoot: path.resolve('.'),
      dataDirectory: themesDirectory,
      databasePath: path.join(dataRoot, 'accounts.sqlite'),
      publicMediaLibraryRoot: mediaLibraryDirectory,
      serveFrontend: false,
    })
  })

  afterEach(async () => {
    app.locals.authStore.close()
    await rm(dataRoot, { recursive: true, force: true })
  })

  it('registers, restores, logs out, and logs in an immediately active account', async () => {
    const agent = request.agent(app)
    const registered = await register(agent, 'designer')
    expect(registered.status).toBe(201)
    expect(registered.body.user).toMatchObject({
      username: 'designer',
      email: 'designer@example.test',
      emailConfirmed: true,
    })
    expect(registered.headers['set-cookie'][0]).toContain('HttpOnly')

    const database = new Database(path.join(dataRoot, 'accounts.sqlite'), {
      readonly: true,
    })
    const storedUser = database.prepare('SELECT * FROM users').get()
    const storedSession = database.prepare('SELECT * FROM sessions').get()
    database.close()
    expect(storedUser.password_hash).not.toContain('correct-horse-42')
    expect(storedUser.password_salt).toHaveLength(48)
    expect(storedSession.token_hash).toMatch(/^[a-f0-9]{64}$/)

    const restored = await agent.get('/api/auth/me')
    expect(restored.body.user.username).toBe('designer')
    expect((await register(request.agent(app), 'designer')).status).toBe(409)

    expect((await agent.post('/api/auth/logout')).status).toBe(204)
    expect((await agent.get('/api/auth/me')).body.user).toBeNull()
    expect(
      (
        await agent.post('/api/auth/login').send({
          login: 'designer@example.test',
          password: 'wrong-password',
        })
      ).status,
    ).toBe(401)
    const login = await agent.post('/api/auth/login').send({
      login: 'designer@example.test',
      password: 'correct-horse-42',
    })
    expect(login.status).toBe(200)
    expect(login.body.user.username).toBe('designer')
  })

  it('clones all default levels into an account-owned private theme', async () => {
    const owner = request.agent(app)
    await register(owner)
    const clone = await owner.post('/api/themes').send({
      sourceThemeId: 'default',
      name: 'Neon Routes',
      description: 'A spatial remix.',
    })

    expect(clone.status).toBe(201)
    expect(clone.body).toMatchObject({
      name: 'Neon Routes',
      description: 'A spatial remix.',
      public: false,
      canEdit: true,
      levelCount: 100,
    })
    expect(clone.body).not.toHaveProperty('ownerUserId')
    const themeFolder = path.join(themesDirectory, clone.body.id)
    expect(await readdir(path.join(themeFolder, 'levels'))).toHaveLength(100)
    expect(await readdir(themeFolder)).toEqual(['levels', 'theme.json'])
    const storedMetadata = JSON.parse(
      await readFile(path.join(themeFolder, 'theme.json')),
    )
    expect(storedMetadata.ownerUserId).toBeTruthy()
    expect(storedMetadata).not.toHaveProperty('editKey')

    expect((await request(app).get(`/api/themes/${clone.body.id}`)).status).toBe(404)
    const editable = await owner.get(`/api/themes/${clone.body.id}`)
    expect(editable.status).toBe(200)
    expect(editable.body.levels).toHaveLength(100)
    expect(new Set(editable.body.levels.map((level) => level.internalId)).size).toBe(
      100,
    )
    const mine = await owner.get('/api/themes/mine')
    expect(mine.body.themes.map((theme) => theme.id)).toContain(clone.body.id)

    const other = request.agent(app)
    await register(other, 'otherowner')
    expect((await other.get(`/api/themes/${clone.body.id}`)).status).toBe(404)
    expect(
      (
        await other
          .patch(`/api/themes/${clone.body.id}`)
          .send({ public: true })
      ).status,
    ).toBe(403)
    expect(
      (await owner.patch('/api/themes/default').send({ public: false })).status,
    ).toBe(403)
  })

  it('rejects invalid saves and supports valid editing and publication', async () => {
    const owner = request.agent(app)
    await register(owner)
    const clone = await owner.post('/api/themes').send({
      sourceThemeId: 'default',
      name: 'Workshop Test',
      description: '',
    })
    const theme = await owner.get(`/api/themes/${clone.body.id}`)
    const first = theme.body.levels[0]
    const level = (
      await owner.get(`/api/themes/${clone.body.id}/levels/${first.internalId}`)
    ).body

    const validDraft = await owner
      .post(`/api/themes/${clone.body.id}/levels/validate`)
      .send(level)
    expect(validDraft.body).toEqual({ valid: true, errors: [] })
    const invalidDraft = await owner
      .post(`/api/themes/${clone.body.id}/levels/validate`)
      .send({ ...level, name: '' })
    expect(invalidDraft.status).toBe(200)
    expect(invalidDraft.body.valid).toBe(false)
    expect(invalidDraft.body.errors.length).toBeGreaterThan(0)
    expect(
      (
        await request(app)
          .post(`/api/themes/${clone.body.id}/levels/validate`)
          .send(level)
      ).status,
    ).toBe(401)

    const invalid = await owner
      .put(`/api/themes/${clone.body.id}/levels/${first.internalId}`)
      .send({ ...level, name: '' })
    expect(invalid.status).toBe(422)
    expect(invalid.body.details.length).toBeGreaterThan(0)

    const valid = await owner
      .put(`/api/themes/${clone.body.id}/levels/${first.internalId}`)
      .send({ ...level, name: 'Edited Foundation' })
    expect(valid.status).toBe(200)
    expect(valid.body.level.name).toBe('Edited Foundation')

    const publish = await owner
      .patch(`/api/themes/${clone.body.id}`)
      .send({ public: true })
    expect(publish.status).toBe(200)
    expect(publish.body.public).toBe(true)
    const listing = await request(app).get('/api/themes')
    expect(listing.body.themes.map((item) => item.id)).toContain(clone.body.id)
    expect((await request(app).get(`/api/themes/${clone.body.id}`)).status).toBe(200)
  })

  it('adds, reorders, renumbers, deletes levels, and deletes themes', async () => {
    const owner = request.agent(app)
    await register(owner)
    const clone = await owner.post('/api/themes').send({
      sourceThemeId: 'default',
      name: 'Sequence Test',
    })
    let theme = (await owner.get(`/api/themes/${clone.body.id}`)).body
    const sourceInternalId = theme.levels[0].internalId
    const added = await owner
      .post(`/api/themes/${clone.body.id}/levels`)
      .send({ sourceInternalId })
    expect(added.status).toBe(201)
    expect(added.body.number).toBe(101)

    theme = (await owner.get(`/api/themes/${clone.body.id}`)).body
    const reversed = theme.levels.map((level) => level.internalId).reverse()
    const reordered = await owner
      .put(`/api/themes/${clone.body.id}/level-order`)
      .send({ order: reversed })
    expect(reordered.status).toBe(200)
    expect(reordered.body.levels[0]).toMatchObject({
      internalId: added.body.internalId,
      id: 'level-01',
      number: 1,
    })

    const deletedLevel = await owner.delete(
      `/api/themes/${clone.body.id}/levels/${added.body.internalId}`,
    )
    expect(deletedLevel.status).toBe(200)
    expect(deletedLevel.body.levels).toHaveLength(100)
    expect((await request(app).delete(`/api/themes/${clone.body.id}`)).status).toBe(401)
    expect((await owner.delete(`/api/themes/${clone.body.id}`)).status).toBe(204)
  })

  it('copies catalog images and normalized audio into self-contained themes', async () => {
    const owner = request.agent(app)
    await register(owner, 'mediaowner')
    const clone = await owner.post('/api/themes').send({
      sourceThemeId: 'default',
      name: 'Media Theme',
    })

    const images = await owner.get('/api/media-library').query({ kind: 'image' })
    expect(images.status).toBe(200)
    expect(images.body.items[0]).toMatchObject({
      id: 'images/token.png',
      kind: 'image',
    })
    expect(images.body.collections).toEqual([{ id: 'images', count: 1 }])
    const imageRoot = await owner
      .get('/api/media-library')
      .query({ kind: 'image', folder: '' })
    expect(imageRoot.body).toMatchObject({
      folder: '',
      total: 0,
      folders: [{ path: 'images', name: 'images', count: 1 }],
    })
    const browsedImageFolder = await owner
      .get('/api/media-library')
      .query({ kind: 'image', folder: 'images' })
    expect(browsedImageFolder.body.items[0].id).toBe('images/token.png')
    const imageFolder = await owner
      .get('/api/media-library')
      .query({ kind: 'image', collection: 'images' })
    expect(imageFolder.body).toMatchObject({ total: 1 })
    expect(
      (await owner.get('/api/media-library').query({
        kind: 'image',
        collection: 'missing',
      })).status,
    ).toBe(404)
    const visual = await owner
      .put(`/api/themes/${clone.body.id}/media/visuals/token-circle`)
      .send({ assetId: 'images/token.png' })
    expect(visual.status).toBe(200)
    expect(
      await readdir(path.join(themesDirectory, clone.body.id, 'media', 'tokens')),
    ).toEqual(['token-circle.png'])

    const sound = await owner
      .put(`/api/themes/${clone.body.id}/media/audio/coin-collected`)
      .send({ assetId: 'audio/coin.aif' })
    expect(sound.status).toBe(200)
    expect(sound.body).toMatchObject({
      soundId: 'coin-collected',
      sourceFormat: 'aif',
      normalizedFormat: 'wav',
    })
    const audioRoot = path.join(themesDirectory, clone.body.id, 'media', 'audio')
    expect(await readdir(audioRoot)).toEqual([
      'coin-collected.mp3',
      'coin-collected.webm',
      'source',
    ])
    expect(await readdir(path.join(audioRoot, 'source'))).toEqual([
      'coin-collected.wav',
    ])

    const entityVisual = await owner
      .post(`/api/themes/${clone.body.id}/media/entity-overrides`)
      .send({
        kind: 'visual',
        baseId: 'coin-standard',
        assetId: 'images/token.png',
      })
    expect(entityVisual.status).toBe(201)
    expect(entityVisual.body.overrideId).toMatch(/^entity-visual-/)
    const entityAudio = await owner
      .post(`/api/themes/${clone.body.id}/media/entity-overrides`)
      .send({
        kind: 'audio',
        baseId: 'coin-collected',
        assetId: 'audio/coin.aif',
      })
    expect(entityAudio.status).toBe(201)
    expect(entityAudio.body.overrideId).toMatch(/^entity-audio-/)

    const campaign = await owner.get(`/api/themes/${clone.body.id}/campaign`)
    const customizedLevel = campaign.body.levels[0]
    customizedLevel.coins[0].visualOverrideId = entityVisual.body.overrideId
    customizedLevel.coins[0].audioOverrideId = entityAudio.body.overrideId
    expect(
      (
        await owner
          .put(
            `/api/themes/${clone.body.id}/levels/${customizedLevel.internalId}`,
          )
          .send(customizedLevel)
      ).status,
    ).toBe(200)
    customizedLevel.coins[0].visualOverrideId =
      'entity-visual-00000000-0000-0000-0000-000000000000'
    const missingOverride = await owner
      .put(`/api/themes/${clone.body.id}/levels/${customizedLevel.internalId}`)
      .send(customizedLevel)
    expect(missingOverride.status).toBe(422)
    expect(missingOverride.body.details).toContain(
      customizedLevel.coins[0].visualOverrideId,
    )

    const manifest = await owner.get(
      `/api/themes/${clone.body.id}/media-manifest`,
    )
    expect(manifest.status).toBe(200)
    expect(
      manifest.body.visuals.find((entry) => entry.mediaId === 'token-circle'),
    ).toMatchObject({ renderMode: 'texture', sourceScope: 'theme' })
    const coinSound = manifest.body.audio.find(
      (entry) => entry.soundId === 'coin-collected',
    )
    expect(coinSound.fileSourceScope).toBe('theme')
    expect(coinSound.sources).toHaveLength(2)
    expect(coinSound.sources[0]).toContain(
      `/api/themes/${clone.body.id}/media-file/asset.webm?v=`,
    )
    expect(
      manifest.body.visuals.find(
        (entry) => entry.mediaId === entityVisual.body.overrideId,
      ),
    ).toMatchObject({ renderMode: 'texture', sourceScope: 'entity' })
    expect(
      manifest.body.audio.find(
        (entry) => entry.soundId === entityAudio.body.overrideId,
      ),
    ).toMatchObject({ fileSourceScope: 'entity' })
  }, 60_000)

  it('streams personal images into an owner-only library with provenance', async () => {
    const owner = request.agent(app)
    const other = request.agent(app)
    await register(owner, 'uploader')
    await register(other, 'uploadviewer')
    const source = await readFile(
      path.resolve('public/media/themes/celestial-foundry/tokens/token-circle.png'),
    )

    expect(
      (
        await request(app)
          .post('/api/media-library/uploads?kind=image')
          .attach('file', source, {
            filename: 'private-token.png',
            contentType: 'image/png',
          })
      ).status,
    ).toBe(401)
    const uploaded = await owner
      .post('/api/media-library/uploads?kind=image')
      .attach('file', source, {
        filename: 'private-token.png',
        contentType: 'image/png',
      })
    expect(uploaded.status).toBe(201)
    expect(uploaded.body.item).toMatchObject({
      kind: 'image',
      collection: 'uploads',
      originalName: 'private-token.png',
      originalMimeType: 'image/png',
      normalizedFormat: 'png',
      license: 'User-provided',
      credit: 'uploader',
    })
    expect(uploaded.body.item.id).toMatch(/^uploads\/[0-9a-f-]{36}$/)
    expect(uploaded.body.quota.usedBytes).toBeGreaterThan(0)

    const listing = await owner
      .get('/api/media-library')
      .query({ kind: 'image', collection: 'uploads' })
    expect(listing.body.items).toHaveLength(1)
    expect(listing.body.quota.limitBytes).toBe(500 * 1024 * 1024)
    expect(
      (
        await other
          .get('/api/media-library/file')
          .query({ assetId: uploaded.body.item.id })
      ).status,
    ).toBe(404)
    expect(
      (
        await owner
          .get('/api/media-library/file')
          .query({ assetId: uploaded.body.item.id })
      ).status,
    ).toBe(200)

    const clone = await owner.post('/api/themes').send({
      sourceThemeId: 'default',
      name: 'Uploaded Media Theme',
    })
    const applied = await owner
      .put(`/api/themes/${clone.body.id}/media/visuals/token-circle`)
      .send({ assetId: uploaded.body.item.id })
    expect(applied.status).toBe(200)
    const metadata = JSON.parse(
      await readFile(path.join(themesDirectory, clone.body.id, 'theme.json'), 'utf8'),
    )
    expect(metadata.mediaSources.visuals['token-circle'].provenance).toMatchObject({
      assetId: uploaded.body.item.id,
      name: 'private-token.png',
      credit: 'uploader',
      originalMimeType: 'image/png',
    })
    const deleted = await owner.delete(
      `/api/media-library/uploads/${uploaded.body.item.id.slice('uploads/'.length)}`,
    )
    expect(deleted.status).toBe(200)
    expect(
      await readFile(
        path.join(themesDirectory, clone.body.id, 'media', 'tokens', 'token-circle.png'),
      ),
    ).toBeTruthy()
    expect(
      (
        await owner
          .get('/api/media-library/file')
          .query({ assetId: uploaded.body.item.id })
      ).status,
    ).toBe(404)
  })

  it('rejects spoofed uploads, cleans quarantine, and enforces account quota', async () => {
    const owner = request.agent(app)
    await register(owner, 'safeuploader')
    const spoofed = await owner
      .post('/api/media-library/uploads?kind=image')
      .attach('file', Buffer.from('not a png'), {
        filename: 'spoofed.png',
        contentType: 'image/png',
      })
    expect(spoofed.status).toBe(415)
    expect(
      await readdir(path.join(dataRoot, 'user-media', '.quarantine')),
    ).toEqual([])

    const quotaRoot = await mkdtemp(path.join(os.tmpdir(), 'path-protocol-quota-'))
    const quotaApp = await createServerApp({
      repositoryRoot: path.resolve('.'),
      dataDirectory: path.join(quotaRoot, 'themes'),
      databasePath: path.join(quotaRoot, 'accounts.sqlite'),
      publicMediaLibraryRoot: mediaLibraryDirectory,
      personalMediaRoot: path.join(quotaRoot, 'user-media'),
      accountMediaQuotaBytes: 1,
      serveFrontend: false,
    })
    try {
      const limitedOwner = request.agent(quotaApp)
      await register(limitedOwner, 'limitedowner')
      const clone = await limitedOwner.post('/api/themes').send({
        sourceThemeId: 'default',
        name: 'Quota Theme',
      })
      const themeCopyRejected = await limitedOwner
        .put(`/api/themes/${clone.body.id}/media/visuals/token-circle`)
        .send({ assetId: 'images/token.png' })
      expect(themeCopyRejected.status).toBe(413)
      expect(themeCopyRejected.body.code).toBe('MEDIA_QUOTA_EXCEEDED')
      const source = await readFile(
        path.resolve('public/media/themes/celestial-foundry/tokens/token-circle.png'),
      )
      const rejected = await limitedOwner
        .post('/api/media-library/uploads?kind=image')
        .attach('file', source, {
          filename: 'token.png',
          contentType: 'image/png',
        })
      expect(rejected.status).toBe(413)
      expect(rejected.body).toMatchObject({
        code: 'MEDIA_QUOTA_EXCEEDED',
        quota: { usedBytes: 0, limitBytes: 1, remainingBytes: 1 },
      })
      expect(
        await readdir(path.join(quotaRoot, 'user-media', '.quarantine')),
      ).toEqual([])
    } finally {
      quotaApp.locals.authStore.close()
      await rm(quotaRoot, { recursive: true, force: true })
    }

    const byteRoot = await mkdtemp(path.join(os.tmpdir(), 'path-protocol-bytes-'))
    const byteApp = await createServerApp({
      repositoryRoot: path.resolve('.'),
      dataDirectory: path.join(byteRoot, 'themes'),
      databasePath: path.join(byteRoot, 'accounts.sqlite'),
      publicMediaLibraryRoot: mediaLibraryDirectory,
      personalMediaRoot: path.join(byteRoot, 'user-media'),
      uploadLimits: { maxImageBytes: 8 },
      serveFrontend: false,
    })
    try {
      const byteOwner = request.agent(byteApp)
      await register(byteOwner, 'byteowner')
      const tooLarge = await byteOwner
        .post('/api/media-library/uploads?kind=image')
        .attach('file', Buffer.alloc(64, 1), {
          filename: 'large.png',
          contentType: 'image/png',
        })
      expect(tooLarge.status).toBe(413)
      expect(
        await readdir(path.join(byteRoot, 'user-media', '.quarantine')),
      ).toEqual([])
    } finally {
      byteApp.locals.authStore.close()
      await rm(byteRoot, { recursive: true, force: true })
    }
  })
})
