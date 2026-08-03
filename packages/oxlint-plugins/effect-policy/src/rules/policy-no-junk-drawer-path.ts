import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'
import { BANNED_PATH_SEGMENTS, meta, Options, SRC_DIR } from './policy-no-junk-drawer-path.config.js'

export type MessageIds = 'junkDrawerPath'

const isPolicyFile = (filename: string): boolean => filename.endsWith('.policy.ts')

const PathSegments = S.NonEmptyArray(S.String)

const segmentsUnderSrc = (filename: string): ReadonlyArray<string> => {
  const segments = S.decodeUnknownSync(PathSegments)(filename.split('/'))
  let lastSrcIndex = -1
  for (let index = 0; index < segments.length; index++) {
    if (segments[index] === SRC_DIR) lastSrcIndex = index
  }
  if (lastSrcIndex === -1) return []
  return segments.slice(lastSrcIndex + 1)
}

export const policyNoJunkDrawerPath = defineRule({
  meta,
  create(context: Context) {
    if (!isPolicyFile(context.filename)) return {}

    const banned = segmentsUnderSrc(context.filename).find(
      (segment) => BANNED_PATH_SEGMENTS.has(segment),
    ) ?? null
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
