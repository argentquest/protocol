import path from 'node:path'
import { createAuthStore } from '../server/authStore.js'

const emailFlag = process.argv.indexOf('--email')
const email = emailFlag >= 0 ? process.argv[emailFlag + 1] : ''
if (!email) {
  throw new Error('Usage: npm run admin:grant -- --email owner@example.com')
}

const databasePath =
  process.env.PATH_PROTOCOL_DB_PATH ??
  path.resolve('data', 'path-protocol.sqlite')
const authStore = createAuthStore({ databasePath })
try {
  const user = authStore.grantAdminByEmail(email)
  process.stdout.write(`Granted site administrator access to ${user.email}.\n`)
} finally {
  authStore.close()
}
