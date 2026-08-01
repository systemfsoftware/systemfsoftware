import { defineConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/.stryker-tmp/**',
      '**/testResources/**',
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
