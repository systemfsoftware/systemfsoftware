import { defineConfig } from 'oxlint'

import plugin from './index.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-native'

export default defineConfig({
  jsPlugins: [import.meta.resolve(PLUGIN_NAME)],
  rules: plugin.configs.recommended.rules,
})
