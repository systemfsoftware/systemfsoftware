import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Result, Schema as S } from 'effect'
import { meta, Options } from './no-sleeps.config.js'

export type MessageIds = 'waitForTimeout' | 'bareSetTimeout' | 'effectSleep' | 'promiseSetTimeout'

const TIMER_GLOBALS: Record<string, true | undefined> = { window: true, globalThis: true, self: true }

const optionsOf = (input: unknown): Options => Result.getOrThrow(S.decodeUnknownResult(Options)(input))

const memberName = (member: ESTree.MemberExpression): string | undefined => {
  if (member.computed) {
    return member.property.type === 'Literal' && typeof member.property.value === 'string'
      ? member.property.value
      : undefined
  }
  return member.property.type === 'Identifier' ? member.property.name : undefined
}

const identifierOf = (node: ESTree.Node): string | undefined => node.type === 'Identifier' ? node.name : undefined

const enclosingPromise = (node: ESTree.Node): ESTree.NewExpression | null => {
  let parent = node.parent
  while (parent !== null) {
    if (parent.type === 'ArrowFunctionExpression' || parent.type === 'FunctionExpression') {
      const call = parent.parent
      return call !== null && call.type === 'NewExpression' && call.arguments[0] === parent ? call : null
    }
    parent = parent.parent
  }
  return null
}

export const noSleeps = defineRule({
  meta,
  create(context: Context) {
    const { testFilePattern } = optionsOf(context.options[0] ?? {})
    if (!new RegExp(testFilePattern).test(context.filename)) return {}
    return {
      CallExpression(node: ESTree.CallExpression) {
        const callee = node.callee
        if (callee.type === 'MemberExpression') {
          const name = memberName(callee)
          if (name === 'waitForTimeout') {
            context.report({ node, messageId: 'waitForTimeout' })
          } else if (name === 'sleep' && identifierOf(callee.object) === 'Effect') {
            context.report({ node, messageId: 'effectSleep' })
          } else if (name === 'setTimeout' && TIMER_GLOBALS[identifierOf(callee.object) ?? ''] === true) {
            context.report({ node, messageId: 'bareSetTimeout' })
          }
          return
        }
        if (callee.type !== 'Identifier' || callee.name !== 'setTimeout') return
        const promise = enclosingPromise(node)
        if (promise !== null) {
          context.report({ node: promise, messageId: 'promiseSetTimeout' })
        } else {
          context.report({ node, messageId: 'bareSetTimeout' })
        }
      },
    }
  },
})
