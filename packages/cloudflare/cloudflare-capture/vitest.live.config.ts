import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

/**
 * The live lane: `pnpm capture:cloudflare` only. It reaches the real Cloudflare
 * API, so it is deliberately kept out of the offline suite by its own config
 * and directory.
 */
export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['tests/live/**/*.integration.test.ts'],
    includeSource: [],
  },
})
