import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  ...sharedConfig,
  plugins: [tsconfigPaths({ ignoreConfigErrors: true })],
  test: {
    ...sharedConfig.test,
    include: ['__tests__/**/*.test.ts'],
  },
})
