import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [inlineSchemaTests()],
  test: {
    globals: true,
    root: import.meta.dirname,
    include: ['tests/**/*.test.ts', 'src/**/*.property.test.ts', 'src/schema-laws.test.ts'],
    includeSource: ['src/**/*.ts'],
    // The schema-law coverage scan samples obligations per exported schema;
    // the wire-bridge codecs make that scan heavy (mirror of daemon-spec).
    testTimeout: 120_000,
  },
  resolve: {
    conditions: ['@systemfsoftware/source'],
  },
})
