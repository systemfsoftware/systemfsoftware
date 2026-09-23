import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { EMIT_CALLEES, EXPECTED, FIX, meta } from './ban-raw-span-name-emit.config.js'

export type MessageIds = 'banRawSpanName'

type EmitCall = {
  readonly callee: string
  readonly name: string
}

const INTERPOLATION = '${}'

const isEmitCallee = (name: string): boolean => EMIT_CALLEES.some((emit) => emit === name)

const memberPropertyName = (callee: ESTree.MemberExpression): string | null => {
  if (callee.computed) return null
  if (callee.property.type !== 'Identifier') return null
  return callee.property.name
}

const calleeName = (callee: ESTree.CallExpression['callee']): string | null => {
  if (callee.type === 'Identifier') return callee.name
  if (callee.type === 'MemberExpression') return memberPropertyName(callee)
  return null
}

const templateName = (node: ESTree.TemplateLiteral): string =>
  node.quasis.map((quasi) => quasi.value.raw).join(INTERPOLATION)

const inlineName = (arg: ESTree.Expression | ESTree.SpreadElement): string | null => {
  if (arg.type === 'Literal') return typeof arg.value === 'string' ? arg.value : null
  if (arg.type === 'TemplateLiteral') return templateName(arg)
  return null
}

const argName = (arg: ESTree.CallExpression['arguments'][number] | undefined): string | null => {
  if (arg === undefined) return null
  return inlineName(arg)
}

const inspect = (node: ESTree.CallExpression): EmitCall | null => {
  const callee = calleeName(node.callee)
  if (callee === null || !isEmitCallee(callee)) return null
  const name = argName(node.arguments[0])
  if (name === null) return null
  return { callee, name }
}

export const banRawSpanNameEmit = defineRule({
  meta,
  create(context: Context) {
    return {
      CallExpression(node: ESTree.CallExpression) {
        const emitCall = inspect(node)
        if (emitCall === null) return
        context.report({
          node,
          messageId: 'banRawSpanName',
          data: {
            name: emitCall.name,
            callee: emitCall.callee,
            expected: EXPECTED,
            actual: emitCall.name,
            fix: FIX,
          },
        })
      },
    }
  },
})
