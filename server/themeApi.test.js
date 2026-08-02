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
    expect(coinSound.sources[0]).toContain(`/api/themes/${clone.body.id}/media-file`)
  }, 30_000)
})
