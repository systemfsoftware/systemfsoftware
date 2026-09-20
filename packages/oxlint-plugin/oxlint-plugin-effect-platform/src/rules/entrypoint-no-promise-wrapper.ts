import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  ENTRYPOINT_FILE,
  meta,
  PROMISE_CONSTRUCTORS,
  PROMISE_WRAPPER_ACTUAL,
  PROMISE_WRAPPER_EXPECTED,
  PROMISE_WRAPPER_FIX,
  RUN_MAIN,
} from './entrypoint-no-promise-wrapper.config.js'

export type MessageIds = 'promiseWrapper'

const isEntrypointFile = (filename: string): boolean => ENTRYPOINT_FILE.test(filename)

const isRunMainCallee = (callee: ESTree.CallExpression['callee']): boolean => {
  if (callee.type === 'Identifier') return callee.name === RUN_MAIN
  if (callee.type !== 'MemberExpression') return false
  if (callee.computed) return false
  const property = callee.property
  return property.type === 'Identifier' && property.name === RUN_MAIN
}

const promiseConstructorName = (node: ESTree.Node): string | null => {
  if (node.type !== 'CallExpression') return null
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return null
  if (callee.computed) return null
  const object = callee.object
  const property = callee.property
  if (object.type !== 'Identifier') return null
  if (property.type !== 'Identifier') return null
  const qualified = `${object.name}.${property.name}`
  return PROMISE_CONSTRUCTORS.has(qualified) ? qualified : null
}

export const entrypointNoPromiseWrapper = defineRule({
  meta,
  create(context: Context) {
    if (!isEntrypointFile(context.filename)) return {}

    return {
      CallExpression(node: ESTree.CallExpression) {
        if (!isRunMainCallee(node.callee)) return

        const [first] = node.arguments
        if (first === undefined) return

        const name = promiseConstructorName(first)
        if (name === null) return

        context.report({
          node: first,
          messageId: 'promiseWrapper',
          data: {
            name,
            expected: PROMISE_WRAPPER_EXPECTED,
            actual: PROMISE_WRAPPER_ACTUAL,
            fix: PROMISE_WRAPPER_FIX,
          },
        })
      },
    }
  },
})
