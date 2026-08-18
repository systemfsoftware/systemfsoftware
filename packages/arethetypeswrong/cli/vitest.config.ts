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
    include: ['tests/**/*.test.ts', 'src/schema-laws.test.ts'],
    // A kernel suite has no file home under `src/`: it is an in-source block in
    // the module it covers, so the decision and its law travel together.
    includeSource: ['src/**/*.ts'],
    exclude: [...(sharedConfig.test?.exclude ?? []), 'tests/cli-contract.integration.test.ts'],
  },
})
