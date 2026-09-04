/**
 * Oxlint Plugin Entry Point
 *
 * This plugin provides ESLint-compatible rules for use with oxlint's jsPlugins feature.
 * All rules are AST-only (no type-aware features) for maximum compatibility.
 */

import type { Rule } from '@oxlint/plugins'
import effectNative from '@systemfsoftware/oxlint-plugin-effect-native'
import structure from '@systemfsoftware/oxlint-plugin-structure'
import tagDiscipline from '@systemfsoftware/oxlint-plugin-tag-discipline'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin'

interface SourcePlugin {
  readonly meta: { readonly name: string }
  readonly rules: Record<string, Rule>
  readonly configs?: { readonly recommended?: { readonly rules?: Record<string, string> } }
}

// Recommend only what each source itself recommends, never everything in `rules`.
const recommendedFrom = (source: SourcePlugin): Record<string, 'error'> => {
  const recommended: Record<string, 'error'> = {}
  const sourceRecommended = source.configs?.recommended?.rules ?? {}
  for (const ruleName of Object.keys(source.rules)) {
    if (`${source.meta.name}/${ruleName}` in sourceRecommended) {
      recommended[`${PLUGIN_NAME}/${ruleName}`] = 'error'
    }
  }
  return recommended
}

/**
 * The rules this plugin recommends, so a consumer preset can derive the set
 * instead of transcribing it. Every sibling plugin in this family already
 * publishes one; this plugin was the exception, which is why the only complete
 * enablement lived in a config a consumer never installs.
 *
 * Four rules are deliberately absent, matching the architecture's own refusals:
 * `no-barrels` and `no-inline-destructured-type` fire on correct code, and
 * `ban-classes` and `no-bodyless-status-assertion` need a per-package whitelist
 * or a status-assertion vocabulary that only some packages have. A consumer
 * enables those by name; recommending them here would fire on their first file.
 */
const recommendedRules = {
  ...recommendedFrom(effectNative),
  ...recommendedFrom(structure),
  ...recommendedFrom(tagDiscipline),
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    ...effectNative.rules,
    ...structure.rules,
    ...tagDiscipline.rules,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
