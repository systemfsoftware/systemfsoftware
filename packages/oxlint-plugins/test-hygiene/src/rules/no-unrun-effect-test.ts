import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { EFFECT_CONSTRUCTOR, EFFECT_MODULE_ALIAS, meta, RUNNER } from './no-unrun-effect-test.config.js'

export type Options = []
export type MessageIds = 'unrunEffectTest'

const isStaticMemberExpression = (
  node: ESTree.Node,
): node is ESTree.StaticMemberExpression => {
  if (node.type !== 'MemberExpression') return false
  return node.computed !== true
}

// Walks `callee` left through the chain `Effect.xxx(...)(...)...` until it
// finds the top-level `Effect.<method>` MemberExpression whose object is
// an Identifier (the module name), or returns null if the chain isn't an
// Effect pipeline.
const findEffectConstructor = (
  node: ESTree.CallExpression,
): { object: ESTree.IdentifierReference; property: ESTree.IdentifierName } | null => {
  let current: ESTree.Node = node.callee
  // The for-loop's increment expression advances `current` every
  // iteration, so the loop cannot spin even if the body is empty.
  for (;;) {
    if (!isStaticMemberExpression(current)) return null
    const objectNode: ESTree.Expression = current.object
    if (objectNode.type === 'Identifier') {
      return { object: objectNode, property: current.property }
    }
    if (objectNode.type !== 'CallExpression') return null
    current = objectNode.callee
  }
}

const isEffectConstructorCall = (
  member: { object: ESTree.IdentifierReference; property: ESTree.IdentifierName },
): boolean => {
  const object = member.object
  if (!EFFECT_MODULE_ALIAS.test(object.name)) return false
  return EFFECT_CONSTRUCTOR[member.property.name] === true
}

const isEffectExpression = (node: ESTree.CallExpression): boolean => {
  const member = findEffectConstructor(node)
  return member !== null && isEffectConstructorCall(member)
}

const returnedCallExpression = (
  fn: ESTree.ArrowFunctionExpression,
): ESTree.CallExpression | undefined => {
  if (fn.async === true) return undefined
  const body = fn.body
  if (body.type !== 'BlockStatement') {
    return body.type === 'CallExpression' ? body : undefined
  }
  const [only] = body.body
  if (only === undefined || body.body.length !== 1) return undefined
  const argument = only.type === 'ReturnStatement' ? only.argument : undefined
  if (argument === null || argument === undefined || argument.type !== 'CallExpression') return undefined
  return argument
}

export const noUnrunEffectTest = defineRule({
  meta,
  create(context: Context) {
    return {
      CallExpression(node: ESTree.CallExpression) {
        if (node.callee.type !== 'Identifier' || !RUNNER.test(node.callee.name)) return
        const callback = node.arguments[1]
        if (callback === undefined || callback.type !== 'ArrowFunctionExpression') return
        const returned = returnedCallExpression(callback)
        if (returned === undefined) return
        if (!isEffectExpression(returned)) return
        context.report({
          node,
          messageId: 'unrunEffectTest',
          data: { runner: node.callee.name },
        })
      },
    }
  },
})
