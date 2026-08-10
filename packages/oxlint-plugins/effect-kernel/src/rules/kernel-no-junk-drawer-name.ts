import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Option, Schema as S } from 'effect'
import { BANNED_SEGMENTS, KERNEL_SUFFIX, meta } from './kernel-no-junk-drawer-name.config.js'

export type MessageIds = 'junkDrawerSegment'

const isKernelFile = (filename: string): boolean => filename.endsWith(KERNEL_SUFFIX)

const PathSegments = S.NonEmptyArray(S.String)

const firstBannedSegment = (filename: string): Option.Option<string> => {
  const withoutSuffix = filename.slice(0, -KERNEL_SUFFIX.length)
  const segments = S.decodeUnknownSync(PathSegments)(withoutSuffix.split('/'))
  return A.findFirst(segments, (segment) => BANNED_SEGMENTS.includes(segment))
}

export const kernelNoJunkDrawerName = defineRule({
  meta,
  create(context: Context) {
    if (!isKernelFile(context.filename)) return {}

    return {
      Program(node: ESTree.Program) {
        Option.match(firstBannedSegment(context.filename), {
          onNone: () => {},
          onSome: (segment) => {
            context.report({
              node,
              messageId: 'junkDrawerSegment',
              data: {
                name: segment,
                expected: 'a descriptive name for the vocabulary-free behavior it provides (e.g. fold.kernel.ts)',
                actual: `a path segment '${segment}' from the banned junk-drawer list`,
                fix:
                  'rename the module to describe the generic behavior it provides and move it out of the junk-drawer folder',
              },
            })
          },
        })
      },
    }
  },
})
