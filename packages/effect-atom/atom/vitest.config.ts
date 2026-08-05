import * as path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['./test/**/*.test.ts'],
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@systemfsoftware/effect-atom/test': path.join(__dirname, 'test'),
      '@systemfsoftware/effect-atom': path.join(__dirname, 'src'),
    },
  },
})
