import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { vitestFork } from '@systemfsoftware/vitest/plugin'
import { playwright } from '@vitest/browser-playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultClientConditions, defaultServerConditions } from 'vite'
import { defineConfig } from 'vitest/config'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vitestFork()],
  resolve: { conditions: ['@systemfsoftware/source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['@systemfsoftware/source', ...defaultServerConditions] } },
  test: {
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
          includeSource: [],
          setupFiles: ['@systemfsoftware/vitest/guard'],
        },
      },
    ],
  },
})
