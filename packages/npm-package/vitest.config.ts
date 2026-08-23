import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['tests/**/*.test.ts'],
    // The capability, not a record of what exists: this package currently has no
    // `import.meta.vitest` block, and in-source blocks are permitted for
    // module-private helpers. Without the glob the next such block would
    // silently never run.
    includeSource: ['src/**/*.ts'],
  },
})
