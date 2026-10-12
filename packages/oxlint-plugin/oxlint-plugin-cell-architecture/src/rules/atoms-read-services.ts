import { defineRule } from '@oxlint/plugins'

import { meta } from './atoms-read-services.config.js'

export type Options = []
export type MessageIds = 'atomImportsMachineFamily' | 'machineFamilyReactBinding'

export const atomsReadServices = defineRule({
  meta,
  create() {
    return {}
  },
})
