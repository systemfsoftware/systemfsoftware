import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Schema as S } from 'effect'
import { ACL_SUFFIX, BANNED_PATH_SEGMENTS, meta, Options } from './acl-no-anti-pattern-path.config.js'

export type MessageIds = 'antiPatternPath'

const PathSegments = S.NonEmptyArray(S.String)

const pathSegmentsOf = (value: string): A.NonEmptyReadonlyArray<string> =>
  S.decodeUnknownSync(PathSegments)(value.split('/'))

const getAclBaseName = (filename: string): string => A.lastNonEmpty(pathSegmentsOf(filename))

export const aclNoAntiPatternPath = defineRule({
  meta,
  create(context: Context) {
    if (!context.filename.endsWith(ACL_SUFFIX)) return {}

    const directories = A.initNonEmpty(pathSegmentsOf(context.filename))
    const bannedSegment = directories.find((segment) => BANNED_PATH_SEGMENTS.includes(segment))
    if (bannedSegment === undefined) return {}

    return {
      Program(node: ESTree.Program) {
        context.report({
          node,
          messageId: 'antiPatternPath',
          data: {
            name: getAclBaseName(context.filename),
            expected:
              'the ACL under a capability-named directory (banned path segments: core, shell, util, utils, helper, manager, service)',
            actual: `a path segment matching the banned list: ${bannedSegment}`,
            fix:
              'move the file into a directory named for the bounded context it translates — the path should read as a capability, not a technology layer',
          },
        })
      },
    }
  },
})
