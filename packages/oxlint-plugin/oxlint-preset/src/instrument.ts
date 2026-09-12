import { defineConfig } from 'oxlint'

import recommended, {
  options as recommendedOptions,
  plugins as recommendedPlugins,
} from '@systemfsoftware/oxlint-plugin-recommended'

const PLUGIN_EXTENSIONS = ['jsdoc', 'node', 'oxc', 'promise'] as const

/**
 * The instrument set for a package whose subject is the linter itself: the
 * recommended stock tier plus the built-in plugin namespaces the enabled rules
 * key on, and no product rules.
 *
 * @public
 */
export default defineConfig({
  extends: [recommended],
  plugins: [...recommendedPlugins, ...PLUGIN_EXTENSIONS],
  options: { ...recommendedOptions },
  categories: { correctness: 'error' },
})
