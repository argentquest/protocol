import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServerApp } from './app.js'

const serverDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(serverDirectory, '..')
const port = Number(process.env.PORT) || 4173
const app = await createServerApp({ repositoryRoot })

app.listen(port, () => {
  console.log(`Path Protocol server listening on http://localhost:${port}`)
})
