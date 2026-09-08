import { banClasses } from './rules/ban-classes.js'
import { banErrorString } from './rules/ban-error-string.js'
import { internalExportJsdoc } from './rules/internal-export-jsdoc.js'
import { noBarrels } from './rules/no-barrels.js'
import { noDomainBranchingDensity } from './rules/no-domain-branching-density.js'
import { noHandCurriedExport } from './rules/no-hand-curried-export.js'
import { noInlineDestructuredType } from './rules/no-inline-destructured-type.js'
import { noInternalJsdocOutside } from './rules/no-internal-jsdoc-outside.js'
import { noIoBoundaryTests } from './rules/no-io-boundary-tests.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-structure'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('ban-error-string')]: 'error',
  [rule('internal-export-jsdoc')]: 'error',
  [rule('no-domain-branching-density')]: 'error',
  [rule('no-hand-curried-export')]: 'error',
  [rule('no-internal-jsdoc-outside')]: 'error',
  [rule('no-io-boundary-tests')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'ban-classes': banClasses,
    'ban-error-string': banErrorString,
    'internal-export-jsdoc': internalExportJsdoc,
    'no-barrels': noBarrels,
    'no-domain-branching-density': noDomainBranchingDensity,
    'no-hand-curried-export': noHandCurriedExport,
    'no-inline-destructured-type': noInlineDestructuredType,
    'no-internal-jsdoc-outside': noInternalJsdocOutside,
    'no-io-boundary-tests': noIoBoundaryTests,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
