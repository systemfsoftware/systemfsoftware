/**
 * Oxlint Plugin Entry Point
 *
 * This plugin provides ESLint-compatible rules for use with oxlint's jsPlugins feature.
 * All rules are AST-only (no type-aware features) for maximum compatibility.
 */

import { banClasses } from './rules/ban-classes.js'
import { banErrorString } from './rules/ban-error-string.js'
import { entryNameSpan } from './rules/entry-name-span.js'
import { entrySurfaceOrUnit } from './rules/entry-surface-or-unit.js'
import { noBodylessStatusAssertion } from './rules/no-bodyless-status-assertion.js'
import { noContextGenericTag } from './rules/no-context-generic-tag.js'
import { noDateNowInEffect } from './rules/no-date-now-in-effect.js'
import { noDirectTagAccess } from './rules/no-direct-tag-access.js'
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
import { noWildcardReexport } from './rules/no-wildcard-reexport.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin'

const recommendedRules = {
  [`${PLUGIN_NAME}/ban-classes`]: 'error',
  [`${PLUGIN_NAME}/ban-error-string`]: 'error',
  [`${PLUGIN_NAME}/entry-name-span`]: 'error',
  [`${PLUGIN_NAME}/entry-surface-or-unit`]: 'error',
  [`${PLUGIN_NAME}/no-bodyless-status-assertion`]: 'error',
  [`${PLUGIN_NAME}/no-context-generic-tag`]: 'error',
  [`${PLUGIN_NAME}/no-date-now-in-effect`]: 'error',
  [`${PLUGIN_NAME}/no-direct-tag-access`]: 'error',
  [`${PLUGIN_NAME}/no-either-tag-assertions`]: 'error',
  [`${PLUGIN_NAME}/no-inline-destructured-type`]: 'error',
  [`${PLUGIN_NAME}/no-io-boundary-tests`]: 'error',
  [`${PLUGIN_NAME}/no-logging-in-catch`]: 'error',
  [`${PLUGIN_NAME}/no-native-map-in-effect`]: 'error',
  [`${PLUGIN_NAME}/no-native-set-in-effect`]: 'error',
  [`${PLUGIN_NAME}/no-native-setinterval-in-effect`]: 'error',
  [`${PLUGIN_NAME}/no-native-settimeout-in-effect`]: 'error',
  [`${PLUGIN_NAME}/no-new-promise-in-effect`]: 'error',
  [`${PLUGIN_NAME}/no-new-worker-with-wasm-import`]: 'error',
  [`${PLUGIN_NAME}/no-wildcard-reexport`]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'ban-classes': banClasses,
    'ban-error-string': banErrorString,
    'entry-name-span': entryNameSpan,
    'entry-surface-or-unit': entrySurfaceOrUnit,
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
    'no-native-map-in-effect': noNativeMapInEffect,
    'no-native-set-in-effect': noNativeSetInEffect,
    'no-native-setinterval-in-effect': noNativeSetIntervalInEffect,
    'no-native-settimeout-in-effect': noNativeSetTimeoutInEffect,
    'no-wildcard-reexport': noWildcardReexport,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
