import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  ...sharedConfig,
  plugins: [tsconfigPaths({ ignoreConfigErrors: true })],
  test: {
    ...sharedConfig.test,
    // KTD5: the container lane lives in `__tests__` under its own config
    // (`test:contract`); the default `test` task stays container-free and
    // covers the relocated unit specs and the in-source property tests.
    include: ['src/**/*.test.ts'],
  },
})
