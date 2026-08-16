/**
 * Oxlint Plugin Entry Point
 *
 * This plugin provides ESLint-compatible rules for use with oxlint's jsPlugins feature.
 * All rules are AST-only (no type-aware features) for maximum compatibility.
 */

import { banClasses } from './rules/ban-classes.js'
import { banErrorString } from './rules/ban-error-string.js'
import { noBarrels } from './rules/no-barrels.js'
import { noBodylessStatusAssertion } from './rules/no-bodyless-status-assertion.js'
import { noContextGenericTag } from './rules/no-context-generic-tag.js'
import { noDateNowInEffect } from './rules/no-date-now-in-effect.js'
import { noDirectTagAccess } from './rules/no-direct-tag-access.js'
import { noDomainBranchingDensity } from './rules/no-domain-branching-density.js'
import { noEitherTagAssertions } from './rules/no-either-tag-assertions.js'
import { noInlineDestructuredType } from './rules/no-inline-destructured-type.js'
import { noIoBoundaryTests } from './rules/no-io-boundary-tests.js'
import { noLoggingInCatch } from './rules/no-logging-in-catch.js'
import { noNativeMapInEffect } from './rules/no-native-map-in-effect.js'
import { noNativeSetInEffect } from './rules/no-native-set-in-effect.js'
import { noNativeSetIntervalInEffect } from './rules/no-native-setinterval-in-effect.js'
import { noNativeSetTimeoutInEffect } from './rules/no-native-settimeout-in-effect.js'
import { noNewPromiseInEffect } from './rules/no-new-promise-in-effect.js'
import { noNewWorkerWithWasmImport } from './rules/no-new-worker-with-wasm-import.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin'

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
    'no-date-now-in-effect': noDateNowInEffect,
    'no-inline-destructured-type': noInlineDestructuredType,
    'no-io-boundary-tests': noIoBoundaryTests,
    'no-logging-in-catch': noLoggingInCatch,
    'no-new-promise-in-effect': noNewPromiseInEffect,
    'no-new-worker-with-wasm-import': noNewWorkerWithWasmImport,
    'no-direct-tag-access': noDirectTagAccess,
    'no-either-tag-assertions': noEitherTagAssertions,
    'no-domain-branching-density': noDomainBranchingDensity,
    'no-native-map-in-effect': noNativeMapInEffect,
    'no-native-set-in-effect': noNativeSetInEffect,
    'no-native-setinterval-in-effect': noNativeSetIntervalInEffect,
    'no-native-settimeout-in-effect': noNativeSetTimeoutInEffect,
  },
}
