import base from '@systemfsoftware/oxlint-config/base'
import effectDmmf from '@systemfsoftware/oxlint-plugin-effect-dmmf'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [base],

  jsPlugins: [
    import.meta.resolve('@systemfsoftware/oxlint-plugin-effect-dmmf'),
  ],

  rules: {
    ...effectDmmf.configs.recommended.rules,
  },
})
