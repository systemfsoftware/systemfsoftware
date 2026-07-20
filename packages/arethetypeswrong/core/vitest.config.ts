import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['test/**/*.test.ts'],
    exclude: [...(sharedConfig.test?.exclude ?? []), '**/snapshots/**'],
  },
  plugins: [tsconfigPaths()],
})
