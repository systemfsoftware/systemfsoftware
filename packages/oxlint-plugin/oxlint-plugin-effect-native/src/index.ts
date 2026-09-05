import { noDateNowInEffect } from './rules/no-date-now-in-effect.js'
import { noLoggingInCatch } from './rules/no-logging-in-catch.js'
import { noNativeMapInEffect } from './rules/no-native-map-in-effect.js'
import { noNativeSetInEffect } from './rules/no-native-set-in-effect.js'
import { noNativeSetIntervalInEffect } from './rules/no-native-setinterval-in-effect.js'
import { noNativeSetTimeoutInEffect } from './rules/no-native-settimeout-in-effect.js'
import { noNewPromiseInEffect } from './rules/no-new-promise-in-effect.js'
import { noNewWorkerWithWasmImport } from './rules/no-new-worker-with-wasm-import.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-native'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('no-date-now-in-effect')]: 'error',
  [rule('no-logging-in-catch')]: 'error',
  [rule('no-native-map-in-effect')]: 'error',
  [rule('no-native-set-in-effect')]: 'error',
  [rule('no-native-setinterval-in-effect')]: 'error',
  [rule('no-native-settimeout-in-effect')]: 'error',
  [rule('no-new-promise-in-effect')]: 'error',
  [rule('no-new-worker-with-wasm-import')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'no-date-now-in-effect': noDateNowInEffect,
    'no-logging-in-catch': noLoggingInCatch,
    'no-native-map-in-effect': noNativeMapInEffect,
    'no-native-set-in-effect': noNativeSetInEffect,
    'no-native-setinterval-in-effect': noNativeSetIntervalInEffect,
    'no-native-settimeout-in-effect': noNativeSetTimeoutInEffect,
    'no-new-promise-in-effect': noNewPromiseInEffect,
    'no-new-worker-with-wasm-import': noNewWorkerWithWasmImport,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
