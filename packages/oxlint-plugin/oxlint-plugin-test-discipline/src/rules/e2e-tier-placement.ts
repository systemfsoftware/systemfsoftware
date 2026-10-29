import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  INTEGRATION_IN_PACKAGE_ACTUAL,
  INTEGRATION_IN_PACKAGE_EXPECTED,
  INTEGRATION_IN_PACKAGE_FIX,
  meta,
  OUTSIDE_PACKAGE_ACTUAL,
  OUTSIDE_PACKAGE_EXPECTED,
  OUTSIDE_PACKAGE_FIX,
} from './e2e-tier-placement.config.js'
import { isE2ePackage, lanesOf } from './lane.js'
import { basenameOf } from './path.js'

export type MessageIds = 'e2eOutsideE2ePackage' | 'integrationInE2ePackage'

export const e2eTierPlacement = defineRule({
  meta,
  create(context: Context) {
    return {
      Program(node: ESTree.Program) {
        const lanes = lanesOf(context)
        const name = basenameOf(context.filename)
        const e2ePackage = isE2ePackage(context)
        if (lanes.has('e2e') && !e2ePackage) {
          context.report({
            node,
            messageId: 'e2eOutsideE2ePackage',
            data: {
              name,
              expected: OUTSIDE_PACKAGE_EXPECTED,
              actual: OUTSIDE_PACKAGE_ACTUAL,
              fix: OUTSIDE_PACKAGE_FIX,
            },
          })
        }
        if (lanes.has('behaviour') && !lanes.has('e2e') && e2ePackage) {
          context.report({
            node,
            messageId: 'integrationInE2ePackage',
            data: {
              name,
              expected: INTEGRATION_IN_PACKAGE_EXPECTED,
              actual: INTEGRATION_IN_PACKAGE_ACTUAL,
              fix: INTEGRATION_IN_PACKAGE_FIX,
            },
          })
        }
      },
    }
  },
})
