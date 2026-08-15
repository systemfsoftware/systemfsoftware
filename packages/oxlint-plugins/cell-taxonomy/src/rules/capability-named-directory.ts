import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Option as O, Schema as S } from 'effect'
import { ACTUAL, BANNED_SEGMENTS, EXPECTED, FIX, meta, SKIPPED_SEGMENTS } from './capability-named-directory.config.js'

export type MessageIds = 'bannedDirectory'

const ExemptEntry = S.Struct({
  prefix: S.NonEmptyString,
  reason: S.NonEmptyString,
})

const Options = S.Struct({
  exempt: S.Array(ExemptEntry),
})

const decodeOptions = S.decodeUnknownSync(Options)

const NonEmptySegments = S.NonEmptyArray(S.String)

const splitOn = (separator: string) => (value: string): A.NonEmptyReadonlyArray<string> =>
  S.decodeUnknownSync(NonEmptySegments)(value.split(separator))

const pathSegmentsOf = splitOn('/')

const isUnderExemptPrefix = (prefix: string, pathSegments: readonly string[]): boolean => {
  const prefixSegments = pathSegmentsOf(prefix)
  return pathSegments.some((_, offset) =>
    prefixSegments.every((segment, index) => pathSegments[offset + index] === segment)
  )
}

export const capabilityNamedDirectory = defineRule({
  meta,
  create(context: Context) {
    const pathSegments = pathSegmentsOf(context.filename)
    const directories = A.initNonEmpty(pathSegments)

    if (directories.some((segment) => SKIPPED_SEGMENTS[segment] === true)) return {}

    const { exempt } = decodeOptions(context.options[0])
    if (exempt.some((entry) => isUnderExemptPrefix(entry.prefix, pathSegments))) return {}

    const bannedSegment = A.findFirst(directories, (segment) => BANNED_SEGMENTS[segment] === true)
    if (O.isNone(bannedSegment)) return {}

    return {
      Program(node: ESTree.Program) {
        context.report({
          node,
          messageId: 'bannedDirectory',
          data: {
            name: bannedSegment.value,
            expected: EXPECTED,
            actual: ACTUAL,
            fix: FIX,
          },
        })
      },
    }
  },
})
