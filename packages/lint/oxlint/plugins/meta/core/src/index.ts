/**
 * Oxlint Plugin Entry Point
 *
 * This plugin provides ESLint-compatible rules for use with oxlint's jsPlugins feature.
 * All rules are AST-only (no type-aware features) for maximum compatibility.
 */

import type { Rule } from '@oxlint/plugins'
import effectNative from '@systemfsoftware/oxlint-plugin-effect-native'

import { banClasses } from './rules/ban-classes.js'
import { banErrorString } from './rules/ban-error-string.js'
import { internalExportJsdoc } from './rules/internal-export-jsdoc.js'
import { noBarrels } from './rules/no-barrels.js'
import { noBodylessStatusAssertion } from './rules/no-bodyless-status-assertion.js'
import { noContextGenericTag } from './rules/no-context-generic-tag.js'
import { noDirectTagAccess } from './rules/no-direct-tag-access.js'
import { noDomainBranchingDensity } from './rules/no-domain-branching-density.js'
import { noEitherTagAssertions } from './rules/no-either-tag-assertions.js'
import { noInlineDestructuredType } from './rules/no-inline-destructured-type.js'
import { noInternalJsdocOutside } from './rules/no-internal-jsdoc-outside.js'
import { noIoBoundaryTests } from './rules/no-io-boundary-tests.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

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
  [rule('ban-error-string')]: 'error',
  [rule('no-context-generic-tag')]: 'error',
  [rule('no-direct-tag-access')]: 'error',
  [rule('no-domain-branching-density')]: 'error',
  [rule('no-either-tag-assertions')]: 'error',
  [rule('no-io-boundary-tests')]: 'error',
  [rule('internal-export-jsdoc')]: 'error',

  [rule('no-internal-jsdoc-outside')]: 'error',
  ...recommendedFrom(effectNative),
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'ban-classes': banClasses,
    'ban-error-string': banErrorString,
    'no-barrels': noBarrels,
    'no-bodyless-status-assertion': noBodylessStatusAssertion,
    'no-context-generic-tag': noContextGenericTag,
    'no-inline-destructured-type': noInlineDestructuredType,
    'internal-export-jsdoc': internalExportJsdoc,
    'no-internal-jsdoc-outside': noInternalJsdocOutside,
    'no-io-boundary-tests': noIoBoundaryTests,
    'no-direct-tag-access': noDirectTagAccess,
    'no-either-tag-assertions': noEitherTagAssertions,
    'no-domain-branching-density': noDomainBranchingDensity,
    ...effectNative.rules,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
