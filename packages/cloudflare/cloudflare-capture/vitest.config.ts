import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

/**
 * The offline lane. Every spec here runs without network. The live suite lives
 * under `tests/live/`, is excluded by directory (never by a filename suffix,
 * CONST-T12), and runs only through `capture:cloudflare` with
 * `vitest.live.config.ts`.
 */
export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests()],
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.test.ts', 'tests/**/*.integration.test.ts'],
    exclude: [...(sharedConfig.test?.exclude ?? []), 'tests/live/**'],
    includeSource: ['src/**/*.ts'],
  },
})
