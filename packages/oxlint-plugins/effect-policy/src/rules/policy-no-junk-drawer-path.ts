import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'
import { BANNED_PATH_SEGMENTS, meta, Options, SRC_DIR } from './policy-no-junk-drawer-path.config.js'

export type MessageIds = 'junkDrawerPath'

const isPolicyFile = (filename: string): boolean => filename.endsWith('.policy.ts')

const PathSegments = S.NonEmptyArray(S.String)

const findBannedSegment = (filename: string): string | null => {
  const segments = S.decodeUnknownSync(PathSegments)(filename.split('/'))
  const lastSrcIndex = segments.lastIndexOf(SRC_DIR)
  if (lastSrcIndex === -1) return null
  for (const segment of segments.slice(lastSrcIndex + 1)) {
    if (BANNED_PATH_SEGMENTS.has(segment)) return segment
  }
  return null
}

export const policyNoJunkDrawerPath = defineRule({
  meta,
  create(context: Context) {
    if (!isPolicyFile(context.filename)) return {}

    const banned = findBannedSegment(context.filename)
    if (banned === null) return {}

    return {
      Program(node: ESTree.Program) {
        context.report({
          node,
          messageId: 'junkDrawerPath',
          data: {
            name: banned,
            expected: 'a *.policy.ts under a capability-owned path segment (src/<capability>/...)',
            actual: `the path segment ${banned}`,
            fix: 'move the policy under its capability directory, e.g. src/<capability>/policies/<name>.policy.ts',
          },
        })
      },
    }
  },
})
