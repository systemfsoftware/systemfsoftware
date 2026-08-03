import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Schema as S } from 'effect'
import { ACL_SUFFIX, meta, Options } from './acl-transform-orfail-required.config.js'

export type MessageIds = 'transformOrFailRequired'

const AclFileName = S.NonEmptyArray(S.String)

const getAclBaseName = (filename: string): string =>
  A.lastNonEmpty(S.decodeUnknownSync(AclFileName)(filename.split('/')))

const isTransformOrFailCall = (node: ESTree.CallExpression): boolean => {
  if (node.callee.type !== 'MemberExpression') return false
  if (node.callee.object.type !== 'Identifier' || node.callee.object.name !== 'S') return false
  if (node.callee.property.type !== 'Identifier') return false
  return node.callee.property.name === 'transformOrFail'
}

export const aclTransformOrfailRequired = defineRule({
  meta,
  create(context: Context) {
    if (!context.filename.endsWith(ACL_SUFFIX)) return {}

    let seenTransformOrFail = false

    return {
      CallExpression(node: ESTree.CallExpression) {
        if (isTransformOrFailCall(node)) seenTransformOrFail = true
      },
      'Program:exit'(node: ESTree.Program) {
        if (seenTransformOrFail) return
        context.report({
          node: node.body[0] ?? node,
          messageId: 'transformOrFailRequired',
          data: {
            name: getAclBaseName(context.filename),
            expected: 'at least one S.transformOrFail call decoding a foreign shape into a branded domain type',
            actual: 'no S.transformOrFail call',
            fix:
              'declare the crossing as S.transformOrFail(SourceSchema, DomainSchema, { strict: true, decode, encode }) with the inactive direction returning ParseResult.Forbidden — or rename the file if it is not an ACL',
          },
        })
      },
    }
  },
})
