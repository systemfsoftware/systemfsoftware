import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { isInRunnerLane, type Lanes, lanesOf } from './lane.js'
import { basenameOf, isTestFile, isUnderSrc } from './path.js'
import {
  LANE_MISMATCH_ACTUAL,
  LANE_MISMATCH_FIX,
  LANE_WORDS,
  meta,
  type NamedLane,
  NO_LANE_ACTUAL,
  NO_LANE_EXPECTED,
  NO_LANE_FIX,
  PROPERTY_OUTSIDE_SRC_ACTUAL,
  PROPERTY_OUTSIDE_SRC_EXPECTED,
  PROPERTY_OUTSIDE_SRC_FIX,
  SPECIFIC_LANES,
  suffixOf,
} from './test-suffix-outside-src.config.js'

export type MessageIds = 'laneMismatch' | 'noLane' | 'propertyOutsideSrc'

/** The lane word: the dotted segment immediately before `.test.ts`; earlier segments name the subject. */
const LANE_WORD = /\.([^.]+)\.test\.ts$/

/**
 * The lanes the file may be named for: every conformance, differential or trace
 * lane it selects (any one of their words will do), else behaviour, else the
 * runner lane a `vitest-runner` package grants.
 */
const nameableLanes = (lanes: Lanes, runner: boolean): ReadonlyArray<NamedLane> => {
  const specific = SPECIFIC_LANES.filter((lane) => lanes.has(lane))
  if (specific.length > 0) return specific
  if (lanes.has('behaviour')) return ['behaviour']
  return runner ? ['runner'] : []
}

export const testSuffixOutsideSrc = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    const basename = basenameOf(filename)
    if (isUnderSrc(filename) || !isTestFile(basename)) return {}
    return {
      Program(node: ESTree.Program) {
        const lanes = lanesOf(context)
        const nameable = nameableLanes(lanes, isInRunnerLane(context))
        if (nameable.length === 0) {
          const property = lanes.has('property')
          context.report({
            node,
            messageId: property ? 'propertyOutsideSrc' : 'noLane',
            data: property
              ? {
                name: basename,
                expected: PROPERTY_OUTSIDE_SRC_EXPECTED,
                actual: PROPERTY_OUTSIDE_SRC_ACTUAL,
                fix: PROPERTY_OUTSIDE_SRC_FIX,
              }
              : { name: basename, expected: NO_LANE_EXPECTED, actual: NO_LANE_ACTUAL, fix: NO_LANE_FIX },
          })
          return
        }
        const word = LANE_WORD.exec(basename)?.[1]
        if (nameable.some((lane) => LANE_WORDS[lane] === word)) return
        context.report({
          node,
          messageId: 'laneMismatch',
          data: {
            name: basename,
            expected: nameable.map(suffixOf).join(' or '),
            actual: LANE_MISMATCH_ACTUAL,
            fix: LANE_MISMATCH_FIX,
          },
        })
      },
    }
  },
})
