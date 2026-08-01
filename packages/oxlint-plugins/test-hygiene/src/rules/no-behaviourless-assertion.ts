// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

export type Options = []
export type MessageIds = 'behaviourlessAssertion'

const TEST_FILE = /\.(test|spec)\.[cm]?tsx?$/
const EXPECT = 'expect'

const BEHAVIOUR_NODES: Record<string, true> = {
  AwaitExpression: true,
  CallExpression: true,
  NewExpression: true,
  TaggedTemplateExpression: true,
}

const isNode = (value: unknown): value is ESTree.Node =>
  typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'

/**
 * An identifier that is not an import binding is treated as behaviour, because it was bound
 * locally and most often holds a call result (`const verdict = interpret(cmd)`). That
 * direction is deliberate: only import bindings are known to be declarations and only
 * literals are known to be inert, so anything else is given the benefit of the doubt and the
 * rule stays silent. It under-reports rather than accusing a real assertion.
 */
const dependsOnBehaviour = (node: unknown, imported: ReadonlySet<string>): boolean => {
  if (Array.isArray(node)) return node.some((child) => dependsOnBehaviour(child, imported))
  if (!isNode(node)) return false
  if (BEHAVIOUR_NODES[node.type] === true) return true
  if (node.type === 'Identifier') return !imported.has(node.name)

  for (const [key, value] of Object.entries(node)) {
    if (key === 'type' || key === 'loc' || key === 'range' || key === 'parent') continue
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
  if (target.callee.type !== 'Identifier' || target.callee.name !== EXPECT) return undefined
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
  meta: {
    type: 'problem',
    docs: {
      description:
        'Flag an assertion whose subject and expectation are both built only from imported declarations and ' +
        'literals. Such an assertion invokes nothing, so no change to the behaviour under test can make it fail.',
    },
    schema: [],
    messages: {
      behaviourlessAssertion: 'Expected: an assertion over a value the code under test produced. ' +
        'Actual: both sides are built only from imported declarations and literals, so this calls nothing and ' +
        'cannot fail on any behaviour change. ' +
        'Fix: assert the output of the function under test, or delete this — mutation score is computed over ' +
        'mutants, not tests, so a worthless test leaves it untouched and nothing else will catch this.',
    },
  },
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
