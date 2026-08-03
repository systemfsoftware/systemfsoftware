import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Schema as S } from 'effect'
import {
  ANTI_PATTERN_PATH_ACTUAL_PREFIX,
  ANTI_PATTERN_PATH_EXPECTED,
  ANTI_PATTERN_PATH_FIX,
  BANNED_PATH_SEGMENTS,
  meta,
  SHAPE_SUFFIX,
} from './shape-no-anti-pattern-path.config.js'

export type MessageIds = 'antiPatternPath'

const PathSegments = S.NonEmptyArray(S.String)

const pathSegmentsOf = (value: string): A.NonEmptyReadonlyArray<string> =>
  S.decodeUnknownSync(PathSegments)(value.split('/'))

const shapeBaseName = (filename: string): string => A.lastNonEmpty(pathSegmentsOf(filename))

export const shapeNoAntiPatternPath = defineRule({
  meta,
  create(context: Context) {
    if (!context.filename.endsWith(SHAPE_SUFFIX)) return {}

    const directories = A.initNonEmpty(pathSegmentsOf(context.filename))
    const bannedSegment = directories.find((segment) => BANNED_PATH_SEGMENTS.includes(segment))
    if (bannedSegment === undefined) return {}

    return {
      Program(node: ESTree.Program) {
        context.report({
          node,
          messageId: 'antiPatternPath',
          data: {
            name: shapeBaseName(context.filename),
            expected: ANTI_PATTERN_PATH_EXPECTED,
            actual: `${ANTI_PATTERN_PATH_ACTUAL_PREFIX} ${bannedSegment}`,
            fix: ANTI_PATTERN_PATH_FIX,
          },
        })
      },
    }
  },
})
