import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Normalizes the public deployment prefix used by Vite-generated asset URLs.
 *
 * @param {string} value Requested URL path prefix.
 * @returns {string} Root-relative path with leading and trailing slashes.
 */
function normalizeBasePath(value) {
  const path = String(value || '/').trim()
  if (path === '/') return '/'
  return `/${path.replace(/^\/+|\/+$/g, '')}/`
}

export default defineConfig({
  base: normalizeBasePath(process.env.VITE_BASE_PATH),
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/tests/setup.js',
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    testTimeout: 60000,
    coverage: {
      reporter: ['text', 'html'],
    },
  },
})
