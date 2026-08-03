import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { ACL_SUFFIX, meta, Options } from './acl-no-as-casts.config.js'

export type MessageIds = 'asCast'

const isAclFile = (filename: string): boolean => filename.endsWith(ACL_SUFFIX)

const typeNameLabel = (typeName: ESTree.TSTypeName): string => {
  if (typeName.type === 'Identifier') return typeName.name
  if (typeName.type === 'TSQualifiedName') return typeName.right.name
  return typeName.type
}

const castTypeLabel = (annotation: ESTree.TSType): string =>
  annotation.type === 'TSTypeReference' ? typeNameLabel(annotation.typeName) : annotation.type

export const aclNoAsCasts = defineRule({
  meta,
  create(context: Context) {
    if (!isAclFile(context.filename)) return {}

    return {
      TSAsExpression(node: ESTree.TSAsExpression) {
        context.report({
          node,
          messageId: 'asCast',
          data: {
            name: 'an `as` cast',
            expected: 'a domain value produced by ParseResult.decode(DomainSchema)',
            actual: `an 'as ${castTypeLabel(node.typeAnnotation)}' assertion`,
            fix:
              'hand the decoded object to ParseResult.decode(DomainSchema) so branding and refinements apply through the schema contract — never assert the brand',
          },
        })
      },
    }
  },
})
