import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests()],
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.test.ts', '__tests__/**/*.integration.test.ts'],
    // The includeSource pass must not re-collect test files under src/__tests__/
    // as sources: their fixture strings legitimately mention `import.meta.vitest`,
    // and vitest's in-source detector treats any occurrence as a real block,
    // running the file a second time.
    includeSource: ['src/**/*.{js,ts}', '!src/__tests__/**'],
    setupFiles: ['vitest-setup.ts'],
  },
})
