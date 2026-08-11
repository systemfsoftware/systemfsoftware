import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: [new URL('../../oxlint-plugins/cell-taxonomy/dist/index.mjs', import.meta.url).pathname],

  rules: {
    '@systemfsoftware/oxlint-plugin-cell-taxonomy/capability-named-directory': 'error',
    'no-unused-vars': 'off',
  },
  ignorePatterns: ['**/testResources/**'],
})
