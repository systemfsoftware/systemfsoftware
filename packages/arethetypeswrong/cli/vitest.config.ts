import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['__tests__/**/*.test.ts', 'src/schema-laws.test.ts'],
    exclude: [...(sharedConfig.test?.exclude ?? []), '**/*.feature.test.ts'],
  },
  plugins: [tsconfigPaths()],
})
