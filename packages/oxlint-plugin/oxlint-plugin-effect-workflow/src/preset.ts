import { defineConfig } from 'oxlint'

import plugin from './index.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-workflow'

export default defineConfig({
  jsPlugins: [import.meta.resolve(PLUGIN_NAME)],
  rules: plugin.configs.recommended.rules,
  overrides: [
    {
      // CONST-P2 expression law for the boundary this package owns: a workflow
      // body is one converging path, so its cyclomatic complexity is 1.
      files: ['**/src/**/*.workflow.ts'],
      rules: { complexity: ['error', { max: 1, variant: 'modified' }] },
    },
  ],
})
