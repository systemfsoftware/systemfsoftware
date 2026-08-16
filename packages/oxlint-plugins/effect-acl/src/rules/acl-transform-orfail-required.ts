import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Schema as S } from 'effect'
import { ACL_SUFFIX, meta } from './acl-transform-orfail-required.config.js'
import { isV4DecodeToTransformCall } from './v4-transform-detection.js'

export type MessageIds = 'transformOrFailRequired'

const AclFileName = S.NonEmptyArray(S.String)

const getAclBaseName = (filename: string): string =>
  A.lastNonEmpty(S.decodeUnknownSync(AclFileName)(filename.split('/')))

const isTransformOrFailCall = (node: ESTree.CallExpression): boolean => {
  // v4 spelling: S.decodeTo(to, { decode: SchemaGetter.transformOrFail(…), … })
  if (isV4DecodeToTransformCall(node)) return true
  // v3 spelling: S.transformOrFail(from, to, { … })
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
            expected:
              'at least one schema transform decoding a foreign shape into a branded domain type — v3 S.transformOrFail(From, To, …) or v4 From.pipe(S.decodeTo(S.toType(To), { decode: SchemaGetter.transformOrFail(…) }))',
            actual:
              'no schema transform — no S.transformOrFail call and no S.decodeTo with a SchemaGetter.transformOrFail / SchemaTransformation.transformOrFail getter',
            fix:
              'declare the crossing as S.transformOrFail(SourceSchema, DomainSchema, { strict: true, decode, encode }) with the inactive direction returning ParseResult.Forbidden — or, in effect v4, SourceSchema.pipe(S.decodeTo(S.toType(DomainSchema), { decode: SchemaGetter.transformOrFail(…), encode: SchemaGetter.forbidden(…) })) — or rename the file if it is not an ACL',
          },
        })
      },
    }
  },
})
