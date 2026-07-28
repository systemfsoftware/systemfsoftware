import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { getClassName, getTypeIdIdentifier, isTaggedClassOrError } from './tagged-class.js'
import { meta, Options } from './workflow-typeid-shared-per-union.config.js'

export type MessageIds = 'unionTypeIdMismatch'

const isWorkflowFile = (filename: string): boolean => filename.endsWith('.workflow.ts')

const isSUnionCall = (node: ESTree.CallExpression): boolean => {
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return false
  if (callee.object.type !== 'Identifier' || callee.object.name !== 'S') return false
  if (callee.property.type !== 'Identifier' || callee.property.name !== 'Union') return false
  return true
}

const identifierMembersFromCall = (call: ESTree.CallExpression): string[] => {
  const members: string[] = []
  for (const arg of call.arguments) {
    if (arg.type === 'Identifier') members.push(arg.name)
  }
  return members
}

const identifierMembersFromUnionType = (ann: ESTree.TSUnionType): string[] | undefined => {
  const members: string[] = []
  for (const t of ann.types) {
    if (t.type !== 'TSTypeReference' || t.typeName.type !== 'Identifier') return undefined
    members.push(t.typeName.name)
  }
  return members
}

const collectDistinctTypeIds = (
  memberNames: string[],
  typeIdByClass: Map<string, string | undefined>,
): { distinct: string[]; hasUnknown: boolean } => {
  const distinct = new Set<string>()
  let hasUnknown = false
  for (const name of memberNames) {
    const typeId = typeIdByClass.get(name)
    if (typeId === undefined) {
      hasUnknown = true
      continue
    }
    distinct.add(typeId)
  }
  return { distinct: Array.from(distinct).sort(), hasUnknown }
}

type PendingUnion = { node: ESTree.Node; name: string; members: string[] }

export const workflowTypeidSharedPerUnion = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!isWorkflowFile(filename)) return {}

    const typeIdByClass = new Map<string, string | undefined>()
    const unions: PendingUnion[] = []

    return {
      ClassDeclaration(node: ESTree.Class) {
        if (!node.superClass) return
        if (node.superClass.type !== 'CallExpression') return
        if (!isTaggedClassOrError(node.superClass)) return
        const className = getClassName(node)
        if (className === undefined) return
        typeIdByClass.set(className, getTypeIdIdentifier(node))
      },
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (!node.init || node.init.type !== 'CallExpression') return
        if (!isSUnionCall(node.init)) return
        if (node.id.type !== 'Identifier') return
        unions.push({
          node: node.init,
          name: node.id.name,
          members: identifierMembersFromCall(node.init),
        })
      },
      TSTypeAliasDeclaration(node: ESTree.TSTypeAliasDeclaration) {
        const ann = node.typeAnnotation
        if (ann.type !== 'TSUnionType') return
        const members = identifierMembersFromUnionType(ann)
        if (members === undefined) return
        unions.push({ node: ann, name: node.id.name, members })
      },
      'Program:exit'() {
        for (const union of unions) {
          const { distinct, hasUnknown } = collectDistinctTypeIds(union.members, typeIdByClass)
          if (hasUnknown) continue
          if (distinct.length <= 1) continue
          context.report({
            node: union.node,
            messageId: 'unionTypeIdMismatch',
            data: {
              name: union.name,
              expected:
                'every variant of one union to carry the union\u2019s single shared TypeId (declared once with Symbol.for)',
              actual: `union ${union.name} carries ${distinct.length} distinct TypeIds across its variants: ${
                distinct.join(', ')
              }`,
              fix:
                `declare one shared symbol for the union (const ${union.name}TypeId: unique symbol = Symbol.for('@systemfsoftware/<pkg>/${union.name}')) and put readonly [${union.name}TypeId] = ${union.name}TypeId on every variant`,
            },
          })
        }
      },
    }
  },
})
