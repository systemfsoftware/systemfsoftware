import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'
import { fileURLToPath } from 'node:url'

const pkgRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  ...sharedConfig,
  resolve: {
    // Tests import the package by name (the public-API rule); aliasing the
    // self-name to source keeps the suite independent of dist build ordering.
    conditions: ['@systemfsoftware/source', 'source', 'import', 'node', 'default'],
    alias: [
      {
        find: /^@systemfsoftware\/effect-playwright$/,
        replacement: `${pkgRoot}src/index.ts`,
      },
      {
        find: /^@systemfsoftware\/effect-playwright\/experimental$/,
        replacement: `${pkgRoot}src/experimental/index.ts`,
      },
      {
        find: /^@systemfsoftware\/effect-playwright\/test$/,
        replacement: `${pkgRoot}src/test.ts`,
      },
    ],
  },
  test: {
    ...sharedConfig.test,
    include: ['tests/**/*.integration.test.ts'],
    includeSource: ['src/**/*.ts'],
    sequence: {
      concurrent: true,
    },
    slowTestThreshold: 2000,
  },
})
