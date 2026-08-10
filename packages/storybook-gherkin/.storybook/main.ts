import type { StorybookConfig } from '@storybook/react-vite'

const config = {
  stories: ['../test/browser/**/*.stories.ts'],
  addons: [],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  // Resolve the package's own exports through the `@systemfsoftware/source`
  // condition so the suite exercises src/ directly, not a possibly-stale dist/.
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    resolve: {
      ...viteConfig.resolve,
      conditions: [...(viteConfig.resolve?.conditions ?? []), '@systemfsoftware/source'],
    },
  }),
} satisfies StorybookConfig

export default config
