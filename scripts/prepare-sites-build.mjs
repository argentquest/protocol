import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const outputRoot = resolve(projectRoot, 'dist')
const serverDirectory = resolve(outputRoot, 'server')
const metadataDirectory = resolve(outputRoot, '.openai')

const workerSource = `const INDEX_PATH = '/index.html'

function wantsHtml(request) {
  return request.method === 'GET' &&
    (request.headers.get('accept') || '').includes('text/html')
}

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request)
    if (response.status !== 404 || !wantsHtml(request)) return response

    const fallbackUrl = new URL(INDEX_PATH, request.url)
    return env.ASSETS.fetch(new Request(fallbackUrl, request))
  },
}
`

await mkdir(serverDirectory, { recursive: true })
await mkdir(metadataDirectory, { recursive: true })
await writeFile(resolve(serverDirectory, 'index.js'), workerSource, 'utf8')
await copyFile(
  resolve(projectRoot, '.openai', 'hosting.json'),
  resolve(metadataDirectory, 'hosting.json'),
)
