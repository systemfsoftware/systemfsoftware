import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

// The plugin and the law suite are imported by relative path and not by dev
// edge: effect-schema-law and effect-schema-vite dev-depend on THIS package,
// so a devDependency edge would close a workspace cycle. The alias keeps the
// generated `schema-laws.test.ts` import specifier resolvable without the edge.
export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests()],
  test: {
    ...sharedConfig.test,
    include: ['__tests__/**/*.test.ts', 'src/schema-laws.test.ts'],
    exclude: [...(sharedConfig.test?.exclude ?? []), '**/*.feature.test.ts'],
  },
})
