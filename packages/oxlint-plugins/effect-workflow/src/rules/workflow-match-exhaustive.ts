import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { EMPTY_VISITOR, identifierName, MATCH_ARM_KINDS, meta, Options } from './workflow-match-exhaustive.config.js'

export type MessageIds = 'orElseOnClosedUnion' | 'missingExhaustive'

type ArmKind = 'tag' | 'exhaustive' | 'orElse'

const matchArmKind = (node: ESTree.Node): ArmKind | null => {
  const target = node.type === 'CallExpression' ? node.callee : node
  if (target.type !== 'MemberExpression') return null
  const objectName = identifierName(target.object)
  const propertyName = identifierName(target.property)
  if (objectName !== 'Match') return null
  const kind = MATCH_ARM_KINDS[propertyName]
  if (node.type !== 'CallExpression' && kind === 'tag') return null
  return kind === undefined ? null : kind
}

export const workflowMatchExhaustive = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!filename.endsWith('.workflow.ts')) return EMPTY_VISITOR

    return {
      CallExpression(node: ESTree.CallExpression) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression') return
        const pipeName = identifierName(callee.property)
        if (pipeName !== 'pipe') return
        const object = callee.object
        if (object.type !== 'CallExpression') return
        const valueCallee = object.callee
        if (valueCallee.type !== 'MemberExpression') return
        const valueObjectName = identifierName(valueCallee.object)
        const valuePropertyName = identifierName(valueCallee.property)
        if (valueObjectName !== 'Match' || valuePropertyName !== 'value') return

        let hasTagArm = false
        let orElseNode: ESTree.Node | null = null
        let lastArmKind: ArmKind | null = null

        for (const arg of node.arguments) {
          const kind = matchArmKind(arg)
          lastArmKind = kind
          if (kind === 'tag') {
            hasTagArm = true
          } else if (kind === 'orElse') {
            orElseNode = arg
          }
        }

        const lastArgIsExhaustive = lastArmKind === 'exhaustive'

        if (hasTagArm && orElseNode !== null) {
          context.report({
            node: orElseNode,
            messageId: 'orElseOnClosedUnion',
            data: {
              name: 'Match.orElse',
              expected: 'Match.exhaustive',
              actual: 'Match.orElse over a closed tagged union',
              fix:
                'replace Match.orElse with Match.exhaustive and add an arm per tag, so a new variant fails to compile',
            },
          })
        } else if (hasTagArm && !lastArgIsExhaustive) {
          context.report({
            node,
            messageId: 'missingExhaustive',
            data: {
              name: 'Match.value(...).pipe(...)',
              expected: 'a Match.exhaustive terminator',
              actual: 'a tag dispatch with no exhaustiveness terminator',
              fix: 'end the pipe with Match.exhaustive',
            },
          })
        }
      },
    }
  },
})
