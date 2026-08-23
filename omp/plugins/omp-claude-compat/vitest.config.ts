import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [inlineSchemaTests({ refutationCoverage: true })],
  test: {
    globals: true,
    root: import.meta.dirname,
    include: ['tests/**/*.test.ts', 'src/**/*.property.test.ts', 'src/schema-laws.test.ts'],
    includeSource: ['src/**/*.ts'],
    // The schema-law coverage scan samples obligations per exported schema; the
    // wire-bridge codecs make that scan heavy (mirror of daemon-spec). Splitting the
    // bridge's schemas into the modules that declare them added obligations, and the
    // sweep then took 126s on a CI runner against a 120s budget - the budget was the
    // only thing that failed, so it is the budget that moves.
    testTimeout: 300_000,
  },
  resolve: {
    conditions: ['@systemfsoftware/source'],
  },
})
