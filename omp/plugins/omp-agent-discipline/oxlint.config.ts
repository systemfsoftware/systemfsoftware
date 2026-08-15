import strict from '@systemfsoftware/oxlint-config/strict'
import effectExecutor from '@systemfsoftware/oxlint-plugin-effect-executor'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [strict],

  jsPlugins: [import.meta.resolve('@systemfsoftware/oxlint-plugin-effect-executor')],

  rules: {
    ...effectExecutor.configs.recommended.rules,
  },
})
