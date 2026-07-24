import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/tests/setup.js',
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    testTimeout: 15000,
    coverage: {
      reporter: ['text', 'html'],
    },
  },
})
