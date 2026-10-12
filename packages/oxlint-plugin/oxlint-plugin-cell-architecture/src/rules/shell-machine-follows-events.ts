import { defineRule } from '@oxlint/plugins'

import { meta } from './shell-machine-follows-events.config.js'

export type Options = []
export type MessageIds =
  | 'unresolvableConfig'
  | 'unclosedTransition'
  | 'disallowedConfigKey'
  | 'missingEventType'
  | 'rootMachineFactory'
  | 'familyDynamicImport'
  | 'familyReExport'

export const shellMachineFollowsEvents = defineRule({
  meta,
  create() {
    return {}
  },
})
