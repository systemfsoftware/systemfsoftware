import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { packageOf, reachOf } from './e2e-shape.js'
import {
  meta,
  NOT_A_FEATURE_ACTUAL,
  NOT_A_FEATURE_EXPECTED,
  NOT_A_FEATURE_FIX,
  OTHER_TEST_ACTUAL,
  OTHER_TEST_EXPECTED,
  OTHER_TEST_FIX,
  OUTSIDE_PACKAGE_ACTUAL,
  OUTSIDE_PACKAGE_EXPECTED,
  OUTSIDE_PACKAGE_FIX,
  OUTSIDE_TESTS_ACTUAL,
  OUTSIDE_TESTS_EXPECTED,
  OUTSIDE_TESTS_FIX,
  REACHES_NOTHING_ACTUAL,
  REACHES_NOTHING_EXPECTED,
  REACHES_NOTHING_FIX,
  REACHES_SOURCE_ACTUAL,
  REACHES_SOURCE_EXPECTED,
  REACHES_SOURCE_FIX,
} from './e2e-tier-placement.config.js'
import { lanesOf } from './lane.js'
import { E2E_TEST_BASENAME } from './path.config.js'
import { basenameOf, directoriesOf, isE2eTestFile, isTestFile } from './path.js'

export type MessageIds =
  | 'e2eOutsideTests'
  | 'e2eOutsideE2ePackage'
  | 'e2eNotAFeature'
  | 'otherTestInE2ePackage'
  | 'e2eReachesSource'
  | 'featureReachesNothing'

const underTests = (filename: string): boolean => directoriesOf(filename).includes('tests')

export const e2eTierPlacement = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    const name = basenameOf(filename)
    const report = (
      node: ESTree.Node,
      messageId: MessageIds,
      data: { readonly expected: string; readonly actual: string; readonly fix: string },
    ) => context.report({ node, messageId, data: { name, ...data } })
    return {
      Program(program: ESTree.Program) {
        const named = E2E_TEST_BASENAME.test(name)
        if (named && !isE2eTestFile(filename)) {
          report(program, 'e2eOutsideTests', {
            expected: OUTSIDE_TESTS_EXPECTED,
            actual: OUTSIDE_TESTS_ACTUAL,
            fix: OUTSIDE_TESTS_FIX,
          })
          return
        }
        const shape = packageOf(filename)
        if (shape === undefined) return
        const lanes = lanesOf(context)
        if (shape.endToEnd) {
          if (!underTests(filename)) return
          if (named && !lanes.has('behaviour')) {
            report(program, 'e2eNotAFeature', {
              expected: NOT_A_FEATURE_EXPECTED,
              actual: NOT_A_FEATURE_ACTUAL,
              fix: NOT_A_FEATURE_FIX,
            })
          }
          if (isTestFile(name)) {
            report(program, 'otherTestInE2ePackage', {
              expected: OTHER_TEST_EXPECTED,
              actual: OTHER_TEST_ACTUAL,
              fix: OTHER_TEST_FIX,
            })
          }
          const reach = reachOf(shape, filename, program)
          if (reach !== undefined) {
            report(reach.node ?? program, 'e2eReachesSource', {
              expected: REACHES_SOURCE_EXPECTED,
              actual: `${REACHES_SOURCE_ACTUAL}, ${reach.specifier} in ${basenameOf(reach.file)}`,
              fix: REACHES_SOURCE_FIX,
            })
          }
          return
        }
        if (named) {
          report(program, 'e2eOutsideE2ePackage', {
            expected: OUTSIDE_PACKAGE_EXPECTED,
            actual: OUTSIDE_PACKAGE_ACTUAL,
            fix: OUTSIDE_PACKAGE_FIX,
          })
          return
        }
        if (isTestFile(name) && lanes.has('behaviour') && reachOf(shape, filename, program) === undefined) {
          report(program, 'featureReachesNothing', {
            expected: REACHES_NOTHING_EXPECTED,
            actual: REACHES_NOTHING_ACTUAL,
            fix: REACHES_NOTHING_FIX,
          })
        }
      },
    }
  },
})
