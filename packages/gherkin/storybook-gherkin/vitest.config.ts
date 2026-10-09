import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { vitestFork } from '@systemfsoftware/vitest/plugin'
import { playwright } from '@vitest/browser-playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultClientConditions, defaultServerConditions } from 'vite'
import { defaultInclude, defineConfig } from 'vitest/config'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const prLane = process.env['VITEST_LANE'] === 'pr'
const conformance = '**/*.conformance.test.ts'

export default defineConfig({
  plugins: [vitestFork()],
  resolve: { conditions: ['@systemfsoftware/source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['@systemfsoftware/source', ...defaultServerConditions] } },
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
          // Storybook's vitest plugin registers every story; the guard does not apply.
          ...(prLane ? { include: [...defaultInclude, `!${conformance}`] } : {}),
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
          include: prLane ? [] : ['tests/**/*.test.ts'],
          includeSource: [],
          setupFiles: ['@systemfsoftware/vitest/guard'],
        },
      },
    ],
  },
})
