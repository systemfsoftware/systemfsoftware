import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  meta,
  TIME_SOURCE_ACTUAL,
  TIME_SOURCE_EXPECTED,
  TIME_SOURCE_FIX,
} from './no-time-source-in-schema-module.config.js'

export type MessageIds = 'timeSourceInSchemaModule'

const WORLD_READS: Readonly<Record<string, Readonly<Record<string, true>>>> = {
  Date: { now: true },
  Math: { random: true },
  performance: { now: true },
  crypto: { randomUUID: true },
}

const memberNameOf = (property: ESTree.Node, computed: boolean): string | null => {
  if (!computed && property.type === 'Identifier') return property.name
  if (property.type === 'Literal' && typeof property.value === 'string') return property.value
  if (property.type === 'TemplateLiteral' && property.expressions.length === 0) {
    const first = property.quasis[0]
    if (first === undefined) return null
    return first.value.cooked ?? null
  }
  return null
}

export const noTimeSourceInSchemaModule = defineRule({
  meta,
  create(context: Context) {
    if (!context.filename.endsWith('.schema.ts')) return {}
    return {
      CallExpression(node: ESTree.CallExpression) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression') return
        const target = callee.object
        if (target.type !== 'Identifier') return
        const members = WORLD_READS[target.name]
        if (members === undefined) return
        const member = memberNameOf(callee.property, callee.computed)
        if (member === null || members[member] !== true) return
        context.report({
          node: callee,
          messageId: 'timeSourceInSchemaModule',
          data: {
            name: `a ${target.name}.${member} read in a schema module`,
            expected: TIME_SOURCE_EXPECTED,
            actual: TIME_SOURCE_ACTUAL,
            fix: TIME_SOURCE_FIX,
          },
        })
      },
    }
  },
})
