import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { BEHAVIOUR_NODES, EXPECT, meta, SKIP_WALK_KEYS, TEST_FILE } from './no-behaviourless-assertion.config.js'

export type Options = []
export type MessageIds = 'behaviourlessAssertion'

const isNode = (value: unknown): value is ESTree.Node => typeof value === 'object' && value !== null && 'type' in value

/**
 * An identifier that is not an import binding is treated as behaviour, because it was bound
 * locally and most often holds a call result (`const verdict = interpret(cmd)`). That
 * direction is deliberate; only import bindings are known to be declarations and only
 * literals are known to be inert, so anything else is given the benefit of the doubt and the
 * rule stays silent. It under-reports rather than accusing a real assertion.
 */
const dependsOnBehaviour = (node: unknown, imported: ReadonlySet<string>): boolean => {
  if (Array.isArray(node)) {
    for (const child of node) {
      if (dependsOnBehaviour(child, imported)) return true
    }
    return false
  }
  if (!isNode(node)) return false
  if (BEHAVIOUR_NODES[node.type] === true) return true
  if (node.type === 'Identifier') return !imported.has(node.name)

  for (const [key, value] of Object.entries(node)) {
    if (SKIP_WALK_KEYS.has(key)) continue
    // In `a.b` the `b` names a field rather than referencing a binding; in `a[b]` it does.
    if (node.type === 'MemberExpression' && key === 'property' && node.computed !== true) continue
    if (dependsOnBehaviour(value, imported)) return true
  }
  return false
}

const expectCallOf = (node: ESTree.CallExpression): ESTree.CallExpression | undefined => {
  if (node.callee.type !== 'MemberExpression') return undefined
  let target: ESTree.Node = node.callee.object
  while (target.type === 'MemberExpression') target = target.object
  if (target.type !== 'CallExpression') return undefined
  const callee = target.callee
  if (!('name' in callee && callee.name === EXPECT)) return undefined
  return target
}

const importedNames = (program: ESTree.Program): Set<string> => {
  const names = new Set<string>()
  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') continue
    for (const specifier of statement.specifiers) names.add(specifier.local.name)
  }
  return names
}

export const noBehaviourlessAssertion = defineRule({
  meta,
  create(context: Context) {
    if (!TEST_FILE.test(context.filename)) return {}
    const imported = importedNames(context.sourceCode.ast)

    return {
      CallExpression(node: ESTree.CallExpression) {
        const expectCall = expectCallOf(node)
        if (expectCall === undefined) return
        const subject = expectCall.arguments[0]
        if (subject === undefined) return

        if (dependsOnBehaviour(subject, imported)) return
        if (dependsOnBehaviour(node.arguments, imported)) return
        context.report({ node, messageId: 'behaviourlessAssertion' })
      },
    }
  },
})
