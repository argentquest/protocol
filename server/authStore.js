import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import Database from 'better-sqlite3'

const scryptAsync = promisify(scrypt)
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000

function normalizeUsername(value) {
  return String(value ?? '').trim()
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

function validateRegistration({ username, email, password }) {
  const errors = []
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
    errors.push('Username must be 3–32 letters, numbers, underscores, or hyphens.')
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    errors.push('Enter a valid email address.')
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    errors.push('Password must contain 8–200 characters.')
  }
  return errors
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

function visibleUser(row) {
  return row
    ? {
        id: row.id,
        username: row.username,
        email: row.email,
        emailConfirmed: Boolean(row.email_confirmed),
      }
    : null
}

/**
 * Creates the SQLite-backed account and session service.
 *
 * @param {object} options Authentication storage options.
 * @param {string} options.databasePath SQLite file path or `:memory:`.
 * @param {boolean} [options.confirmEmail=false] Whether new users require confirmation.
 * @returns {object} Account and session operations.
 */
export function createAuthStore({ databasePath, confirmEmail = false }) {
  const database = new Database(databasePath)
  database.pragma('foreign_keys = ON')
  if (databasePath !== ':memory:') database.pragma('journal_mode = WAL')
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      email_confirmed INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);
  `)

  const findUser = database.prepare(
    'SELECT * FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE',
  )
  const insertUser = database.prepare(`
    INSERT INTO users (
      id, username, email, password_hash, password_salt, email_confirmed, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const insertSession = database.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `)
  const readSession = database.prepare(`
    SELECT users.* FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
      AND users.email_confirmed = 1
  `)
  const deleteSession = database.prepare('DELETE FROM sessions WHERE token_hash = ?')
  const deleteExpired = database.prepare('DELETE FROM sessions WHERE expires_at <= ?')

  async function passwordDigest(password, salt) {
    return (await scryptAsync(password, salt, 64)).toString('hex')
  }

  function createSession(userId) {
    deleteExpired.run(Date.now())
    const token = randomBytes(32).toString('base64url')
    const expiresAt = Date.now() + SESSION_DURATION_MS
    insertSession.run(tokenHash(token), userId, expiresAt, new Date().toISOString())
    return { token, expiresAt }
  }

  async function register(input) {
    const username = normalizeUsername(input.username)
    const email = normalizeEmail(input.email)
    const password = input.password
    const errors = validateRegistration({ username, email, password })
    if (errors.length) {
      throw Object.assign(new Error('Registration validation failed.'), {
        status: 400,
        details: errors,
      })
    }
    if (findUser.get(username, email)) {
      throw Object.assign(new Error('Username or email is already registered.'), {
        status: 409,
      })
    }
    const id = randomUUID()
    const salt = randomBytes(24).toString('hex')
    const digest = await passwordDigest(password, salt)
    try {
      insertUser.run(
        id,
        username,
        email,
        digest,
        salt,
        confirmEmail ? 0 : 1,
        new Date().toISOString(),
      )
    } catch (error) {
      if (error.code?.startsWith('SQLITE_CONSTRAINT')) {
        throw Object.assign(
          new Error('Username or email is already registered.'),
          { status: 409 },
        )
      }
      throw error
    }
    const user = findUser.get(username, email)
    return { user: visibleUser(user), session: createSession(id) }
  }

  async function login(input) {
    const loginName = String(input.login ?? '').trim()
    const user = findUser.get(loginName, loginName.toLowerCase())
    if (!user) {
      throw Object.assign(new Error('Invalid login or password.'), { status: 401 })
    }
    const digest = await passwordDigest(String(input.password ?? ''), user.password_salt)
    const expected = Buffer.from(user.password_hash, 'hex')
    const received = Buffer.from(digest, 'hex')
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw Object.assign(new Error('Invalid login or password.'), { status: 401 })
    }
    if (!user.email_confirmed) {
      throw Object.assign(new Error('Email confirmation is required.'), { status: 403 })
    }
    return { user: visibleUser(user), session: createSession(user.id) }
  }

  function sessionUser(token) {
    if (!token) return null
    return visibleUser(readSession.get(tokenHash(token), Date.now()))
  }

  function logout(token) {
    if (token) deleteSession.run(tokenHash(token))
  }

  return {
    close: () => database.close(),
    login,
    logout,
    register,
    sessionUser,
  }
}

export { SESSION_DURATION_MS }
