import type { StorybookConfig } from '@storybook/react-vite'

const config = {
  stories: ['../test/browser/**/*.stories.ts'],
  addons: [],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
} satisfies StorybookConfig

export default config
