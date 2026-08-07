import { defineConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/.stryker-tmp/**',
      '**/testResources/**',
    ],
    // The integration specs `process.chdir()` into a copied fixture project, which Node
    // forbids on a worker thread, and each starts a nested Vitest instance. Forks give each
    // spec file its own process; serialising the files keeps two nested runs off one core.
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
})
