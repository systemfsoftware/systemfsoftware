import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { packageOf, reachOf } from './e2e-shape.js'
import {
  meta,
  OUTSIDE_PACKAGE_ACTUAL,
  OUTSIDE_PACKAGE_EXPECTED,
  OUTSIDE_PACKAGE_FIX,
  OUTSIDE_TESTS_ACTUAL,
  OUTSIDE_TESTS_EXPECTED,
  OUTSIDE_TESTS_FIX,
  TYPE_REACH_ACTUAL,
  TYPE_REACH_EXPECTED,
  TYPE_REACH_FIX,
} from './e2e-tier-placement.config.js'
import { lanesOf } from './lane.js'
import { E2E_LOOKALIKE_BASENAME, E2E_TEST_BASENAME } from './path.config.js'
import { basenameOf, isE2eTestFile, isUnderSrc } from './path.js'

export type MessageIds = 'e2eOutsideTests' | 'e2eOutsideE2ePackage' | 'e2eReachesSource'

export const e2eTierPlacement = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    const name = basenameOf(filename)
    return {
      Program(node: ESTree.Program) {
        const misplaced = E2E_TEST_BASENAME.test(name)
          ? !isE2eTestFile(filename)
          : E2E_LOOKALIKE_BASENAME.test(name) && isUnderSrc(filename)
        if (misplaced) {
          context.report({
            node,
            messageId: 'e2eOutsideTests',
            data: { name, expected: OUTSIDE_TESTS_EXPECTED, actual: OUTSIDE_TESTS_ACTUAL, fix: OUTSIDE_TESTS_FIX },
          })
          return
        }
        if (!lanesOf(context).has('e2e')) return
        const shape = packageOf(filename)
        if (shape === undefined) return
        if (!shape.shipsNothing) {
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
        const reach = reachOf(shape, filename, node)
        if (reach !== undefined) {
          context.report({
            node,
            messageId: 'e2eReachesSource',
            data: {
              name,
              expected: TYPE_REACH_EXPECTED,
              actual: `${TYPE_REACH_ACTUAL}, ${reach.specifier} in ${basenameOf(reach.file)}`,
              fix: TYPE_REACH_FIX,
            },
          })
        }
      },
    }
  },
})
