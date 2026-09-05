import { entrypointInterpretsOnce } from './rules/entrypoint-interprets-once.js'
import { entrypointNoExports } from './rules/entrypoint-no-exports.js'
import { entrypointNoPromiseWrapper } from './rules/entrypoint-no-promise-wrapper.js'
import { entrypointNotImported } from './rules/entrypoint-not-imported.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-entrypoint'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('entrypoint-interprets-once')]: 'error',
  [rule('entrypoint-no-exports')]: 'error',
  [rule('entrypoint-not-imported')]: 'error',
  [rule('entrypoint-no-promise-wrapper')]: 'error',
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
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
