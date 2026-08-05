import * as path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['./test/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./vitest-setup.ts'],
  },
  resolve: {
    alias: {
      '@systemfsoftware/effect-atom/test': path.join(__dirname, '../atom/test'),
      '@systemfsoftware/effect-atom': path.join(__dirname, '../atom/src'),
      '@systemfsoftware/effect-atom-react/test': path.join(__dirname, 'test'),
      '@systemfsoftware/effect-atom-react': path.join(__dirname, 'src'),
    },
  },
})
