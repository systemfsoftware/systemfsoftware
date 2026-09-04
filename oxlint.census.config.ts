import all from '@systemfsoftware/all'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [all],
  rules: {
    '@systemfsoftware/oxlint-plugin-effect-dmmf/damp-workflow-stem': 'error',
    '@systemfsoftware/oxlint-plugin-effect-dmmf/workflow-file-make-presence': 'error',
  },
})
