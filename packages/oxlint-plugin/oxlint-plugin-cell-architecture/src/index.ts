import { banClasses } from './rules/ban-classes.js'
import { banErrorString } from './rules/ban-error-string.js'
import { banUnknown } from './rules/ban-unknown.js'
import { internalExportJsdoc } from './rules/internal-export-jsdoc.js'
import { noBodylessStatusAssertion } from './rules/no-bodyless-status-assertion.js'
import { noContextGenericTag } from './rules/no-context-generic-tag.js'
import { noDirectTagAccess } from './rules/no-direct-tag-access.js'
import { noEitherTagAssertions } from './rules/no-either-tag-assertions.js'
import { noInternalJsdocOutside } from './rules/no-internal-jsdoc-outside.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-cell-architecture'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('ban-classes')]: 'error',
  [rule('ban-error-string')]: 'error',
  [rule('ban-unknown')]: 'error',
  [rule('internal-export-jsdoc')]: 'error',
  [rule('no-internal-jsdoc-outside')]: 'error',
  [rule('no-bodyless-status-assertion')]: 'error',
  [rule('no-context-generic-tag')]: 'error',
  [rule('no-direct-tag-access')]: 'error',
  [rule('no-either-tag-assertions')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'ban-classes': banClasses,
    'ban-error-string': banErrorString,
    'ban-unknown': banUnknown,
    'internal-export-jsdoc': internalExportJsdoc,
    'no-internal-jsdoc-outside': noInternalJsdocOutside,
    'no-bodyless-status-assertion': noBodylessStatusAssertion,
    'no-context-generic-tag': noContextGenericTag,
    'no-direct-tag-access': noDirectTagAccess,
    'no-either-tag-assertions': noEitherTagAssertions,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
