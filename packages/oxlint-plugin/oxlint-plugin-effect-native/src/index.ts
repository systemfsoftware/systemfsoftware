import { noLoggingInCatch } from './rules/no-logging-in-catch.js'
import { noNativeMapInEffect } from './rules/no-native-map-in-effect.js'
import { noNativeSetInEffect } from './rules/no-native-set-in-effect.js'
import { noNewWorkerWithWasmImport } from './rules/no-new-worker-with-wasm-import.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-native'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('no-logging-in-catch')]: 'error',
  [rule('no-native-map-in-effect')]: 'error',
  [rule('no-native-set-in-effect')]: 'error',
  [rule('no-new-worker-with-wasm-import')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'no-logging-in-catch': noLoggingInCatch,
    'no-native-map-in-effect': noNativeMapInEffect,
    'no-native-set-in-effect': noNativeSetInEffect,
    'no-new-worker-with-wasm-import': noNewWorkerWithWasmImport,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
