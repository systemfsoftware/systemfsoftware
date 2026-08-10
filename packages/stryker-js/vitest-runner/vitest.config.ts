import { defineConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/.stryker-tmp/**',
      '**/testResources/**',
    ],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
})
