import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'
import { playwright } from '@vitest/browser-playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    projects: [
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
            storybookScript: 'pnpm storybook -- --ci',
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            provider: playwright({}),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
    // The shared config turns on v8 coverage under CI, and the v8 provider
    // cannot load inside browser mode. This suite is the M1 story-run - a
    // proof that specs compile, import and run - and never collected coverage
    // before it began inheriting the shared config. Keep it off.
    coverage: { enabled: false },
  },
})
