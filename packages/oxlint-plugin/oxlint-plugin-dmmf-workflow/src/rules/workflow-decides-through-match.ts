import { defineRule } from '@oxlint/plugins'
import { EMPTY_VISITOR, meta } from './workflow-decides-through-match.config.js'

export type MessageIds = 'unchangedSuccess' | 'tagKeyedDispatch'

export const workflowDecidesThroughMatch = defineRule({
  meta,
  create() {
    return EMPTY_VISITOR
  },
})
