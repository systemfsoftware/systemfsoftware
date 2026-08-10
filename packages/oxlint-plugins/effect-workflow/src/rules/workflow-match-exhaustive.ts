import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { EMPTY_VISITOR, identifierName, MATCH_ARM_KINDS, meta } from './workflow-match-exhaustive.config.js'

export type MessageIds = 'orElseOnClosedUnion' | 'orElseOnOpenDispatch' | 'missingExhaustive'

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

/**
 * The one legal `Match.orElse`: a small open record of booleans whose prior
 * arms exhaust the space. Keyed on an object-literal `Match.when` pattern,
 * which is what a record dispatch looks like and what a predicate, literal,
 * or tag dispatch never does.
 */
const isRecordWhenArm = (node: ESTree.Node): boolean => {
  if (node.type !== 'CallExpression') return false
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return false
  if (identifierName(callee.object) !== 'Match') return false
  if (identifierName(callee.property) !== 'when') return false
  return node.arguments[0]?.type === 'ObjectExpression'
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
        let hasRecordWhenArm = false
        let orElseNode: ESTree.Node | null = null
        let lastArmKind: ArmKind | null = null

        for (const arg of node.arguments) {
          const kind = matchArmKind(arg)
          lastArmKind = kind
          if (isRecordWhenArm(arg)) hasRecordWhenArm = true
          if (kind === 'tag') {
            hasTagArm = true
          } else if (kind === 'orElse') {
            orElseNode = arg
          }
        }

        const lastArgIsExhaustive = lastArmKind === 'exhaustive'

        if (orElseNode !== null && hasTagArm) {
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
        } else if (orElseNode !== null && !hasRecordWhenArm) {
          context.report({
            node: orElseNode,
            messageId: 'orElseOnOpenDispatch',
            data: {
              name: 'Match.orElse',
              expected: 'Match.tag arms closed by Match.exhaustive',
              actual: 'Match.orElse as the fallback of a predicate or literal dispatch over an open type',
              fix:
                'derive a closed variant first with a total constructor (Option.fromNullable, a tagged union), then dispatch with Match.tag and Match.exhaustive',
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
