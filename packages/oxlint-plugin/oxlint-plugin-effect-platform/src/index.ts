import { entrypointInterpretsOnce } from './rules/entrypoint-interprets-once.js'
import { entrypointNoExports } from './rules/entrypoint-no-exports.js'
import { entrypointNoPromiseWrapper } from './rules/entrypoint-no-promise-wrapper.js'
import { entrypointNotImported } from './rules/entrypoint-not-imported.js'
import { noLoggingInCatch } from './rules/no-logging-in-catch.js'
import { noNativeMapInEffect } from './rules/no-native-map-in-effect.js'
import { noNativeSetInEffect } from './rules/no-native-set-in-effect.js'
import { noNewWorkerWithWasmImport } from './rules/no-new-worker-with-wasm-import.js'
import { runtimeConstructionPlacement } from './rules/runtime-construction-placement.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-platform'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('entrypoint-interprets-once')]: 'error',
  [rule('entrypoint-no-exports')]: 'error',
  [rule('entrypoint-not-imported')]: 'error',
  [rule('entrypoint-no-promise-wrapper')]: 'error',
  [rule('runtime-construction-placement')]: 'error',
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
    'entrypoint-interprets-once': entrypointInterpretsOnce,
    'entrypoint-no-exports': entrypointNoExports,
    'entrypoint-not-imported': entrypointNotImported,
    'entrypoint-no-promise-wrapper': entrypointNoPromiseWrapper,
    'runtime-construction-placement': runtimeConstructionPlacement,
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
