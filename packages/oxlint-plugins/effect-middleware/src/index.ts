import { middlewareGateFailsOnDecodeFailure } from './rules/middleware-gate-fails-on-decode-failure.js'
import { middlewareNoOperationImports } from './rules/middleware-no-operation-imports.js'
import { middlewareSingleMiddlewareExport } from './rules/middleware-single-middleware-export.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-middleware'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('middleware-gate-fails-on-decode-failure')]: 'error',
  [rule('middleware-no-operation-imports')]: 'error',
  [rule('middleware-single-middleware-export')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'middleware-gate-fails-on-decode-failure': middlewareGateFailsOnDecodeFailure,
    'middleware-no-operation-imports': middlewareNoOperationImports,
    'middleware-single-middleware-export': middlewareSingleMiddlewareExport,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
