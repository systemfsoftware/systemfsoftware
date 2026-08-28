import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

// The plugin and the law suite are imported by relative source path and not by
// dev edge: effect-schema-law and effect-schema-vite dev-depend on
// @systemfsoftware/arethetypeswrong-cli (which depends on this package), so a
// devDependency edge here would close a workspace cycle. The alias keeps the
// generated `schema-laws.test.ts` import specifier resolvable without the edge.
export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests()],
  test: {
    ...sharedConfig.test,
    include: ['tests/**/*.test.ts', 'src/schema-laws.test.ts'],
    exclude: [...(sharedConfig.test?.exclude ?? []), '**/snapshots/**'],
    // The capability, not a record of what exists: this package currently has no
    // `import.meta.vitest` block, and in-source blocks are permitted for module-private
    // helpers. Without the glob the next such block would silently never run.
    includeSource: ['src/**/*.ts'],
  },

  resolve: {
    conditions: ['@systemfsoftware/source', 'source', 'import', 'node', 'default'],
  },
})
