import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { identifierName, meta, Options } from './handler-match-tag-or-else.config.js'

export type MessageIds = 'missingOrElse' | 'exhaustiveInsteadOfOrElse'

const isHandlerFile = (filename: string): boolean => filename.endsWith('.handler.ts')

type ArmKind = 'tag' | 'orElse' | 'exhaustive'

const armKind = (node: ESTree.Node): ArmKind | null => {
  if (node.type !== 'CallExpression') return null
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return null
  if (callee.object.type !== 'Identifier' || callee.object.name !== 'Match') return null
  if (callee.property.type !== 'Identifier') return null
  const propertyName = callee.property.name
  if (propertyName === 'tag') return 'tag'
  if (propertyName === 'orElse') return 'orElse'
  if (propertyName === 'exhaustive') return 'exhaustive'
  return null
}

const isMatchDispatchPipe = (node: ESTree.CallExpression): boolean => {
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return false
  if (identifierName(callee.property) !== 'pipe') return false
  const object = callee.object
  if (object.type !== 'CallExpression') return false
  const objectCallee = object.callee
  if (objectCallee.type !== 'MemberExpression') return false
  if (identifierName(objectCallee.object) !== 'Match') return false
  const propertyName = identifierName(objectCallee.property)
  return propertyName === 'type' || propertyName === 'value'
}

export const handlerMatchTagOrElse = defineRule({
  meta,
  create(context: Context) {
    if (!isHandlerFile(context.filename)) return {}

    return {
      CallExpression(node: ESTree.CallExpression) {
        if (!isMatchDispatchPipe(node)) return

        let hasTagArm = false
        let hasOrElseArm = false
        let lastArmKind: ArmKind | null = null

        for (const arg of node.arguments) {
          const kind = armKind(arg)
          lastArmKind = kind
          if (kind === 'tag') hasTagArm = true
          if (kind === 'orElse') hasOrElseArm = true
        }

        if (!hasTagArm) return

        if (lastArmKind === 'exhaustive') {
          context.report({
            node,
            messageId: 'exhaustiveInsteadOfOrElse',
            data: {
              name: 'Match.exhaustive',
              expected: 'Match.orElse(() => 500) as the terminator',
              actual: 'Match.exhaustive closing a Match.tag dispatch',
              fix:
                'replace Match.exhaustive with Match.orElse(() => 500) — new error variants must degrade to 500 at runtime, not fail the build',
            },
          })
        } else if (!hasOrElseArm) {
          context.report({
            node,
            messageId: 'missingOrElse',
            data: {
              name: 'Match.tag dispatch',
              expected: 'a Match.orElse(() => 500) fallback arm',
              actual: 'a Match.tag dispatch with no Match.orElse arm',
              fix:
                'add Match.orElse(() => 500) as the final arm so a new error variant degrades to a 500 instead of failing the build',
            },
          })
        }
      },
    }
  },
})
