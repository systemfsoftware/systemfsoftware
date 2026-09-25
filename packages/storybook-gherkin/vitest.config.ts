import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { defineConfig, sourceResolveConditions } from '@systemfsoftware/vitest-config'
import { playwright } from '@vitest/browser-playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  ...sourceResolveConditions,
  test: {
    // A pull request runs this package's `vitest run --project conformance` with no file to run: the
    // pr lane leaves the conformance project without its specs, and that run must still pass.
    passWithNoTests: true,
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
      {
        extends: true,
        test: {
          name: 'conformance',
          environment: 'jsdom',
          globals: true,
          include: ['tests/**/*.test.ts'],
        },
      },
    ],
  },
})
