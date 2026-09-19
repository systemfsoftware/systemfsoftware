import type { StorybookConfig } from '@storybook/react-vite'

const config = {
  stories: ['../test/browser/**/*.stories.ts'],
  addons: [],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    resolve: {
      ...viteConfig.resolve,
      conditions: [...(viteConfig.resolve?.conditions ?? []), '@systemfsoftware/source'],
    },
  }),
} satisfies StorybookConfig

export default config
