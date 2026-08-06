import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  ...sharedConfig,
  plugins: [tsconfigPaths({ ignoreConfigErrors: true })],
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.property.test.ts', '__tests__/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
