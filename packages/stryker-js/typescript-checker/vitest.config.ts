import { defineConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/.stryker-tmp/**',
      '**/testResources/**',
    ],
  },
})
