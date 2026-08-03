import { handlerMatchTagOrElse } from './rules/handler-match-tag-or-else.js'
import { handlerNoCasts } from './rules/handler-no-casts.js'
import { handlerNoSwitch } from './rules/handler-no-switch.js'
import { handlerSingleExecutor } from './rules/handler-single-executor.js'
import { handlerSingleHandlerExport } from './rules/handler-single-handler-export.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-handler'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('handler-single-executor')]: 'error',
  [rule('handler-single-handler-export')]: 'error',
  [rule('handler-no-casts')]: 'error',
  [rule('handler-no-switch')]: 'error',
  [rule('handler-match-tag-or-else')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'handler-single-executor': handlerSingleExecutor,
    'handler-single-handler-export': handlerSingleHandlerExport,
    'handler-no-casts': handlerNoCasts,
    'handler-no-switch': handlerNoSwitch,
    'handler-match-tag-or-else': handlerMatchTagOrElse,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
