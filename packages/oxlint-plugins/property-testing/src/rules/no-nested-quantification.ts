import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Option, Schema as S } from 'effect'
import {
  ACTUAL,
  CONSTANT_POOL_ARBITRARIES,
  EXPECTED,
  FASTCHECK_NAMESPACES,
  FIX,
  ITERATOR_METHODS,
  meta,
  Options,
  VIOLATION_NAME,
} from './no-nested-quantification.config.js'
import { getPredicate, isPropCallee, type PredicateFn } from './prop-call.js'

export type MessageIds = 'nestedQuantification'

interface Iteration {
  readonly node: ESTree.Node
  readonly iterable: unknown
  readonly body: unknown
}

const isNode = (value: unknown): value is ESTree.Node => value !== null && typeof value === 'object' && 'type' in value

const elementsOf = (value: unknown): readonly unknown[] | null => Array.isArray(value) ? value : null

const entriesOf = (node: object): readonly (readonly [string, unknown])[] => Object.entries(node)

const visit = (value: unknown, onNode: (node: ESTree.Node) => void): void => {
  const elements = elementsOf(value)
  if (elements !== null) {
    for (const item of elements) visit(item, onNode)
    return
  }
  if (!isNode(value)) return
  onNode(value)
  for (const [key, child] of entriesOf(value)) {
    if (key === 'parent') continue
    visit(child, onNode)
  }
}

const identifiersIn = (value: unknown): ReadonlySet<string> => {
  const names = new Set<string>()
  visit(value, (node) => {
    if (node.type === 'Identifier') names.add(node.name)
  })
  return names
}

const touches = (value: unknown, names: ReadonlySet<string>): boolean => {
  for (const name of identifiersIn(value)) {
    if (names.has(name)) return true
  }
  return false
}

const declaredNamesIn = (predicate: PredicateFn): ReadonlySet<string> => {
  const names = new Set<string>()
  const addPattern = (pattern: unknown): void => {
    for (const name of identifiersIn(pattern)) names.add(name)
  }
  visit(predicate, (node) => {
    if (node.type === 'VariableDeclarator') addPattern(node.id)
    if (node.type === 'FunctionDeclaration' && node.id !== null) names.add(node.id.name)
    if ('params' in node) addPattern(node.params)
  })
  return names
}

const isConstantPool = (element: unknown): boolean => {
  if (!isNode(element)) return false
  if (element.type !== 'CallExpression') return false
  const callee = element.callee
  if (callee.type !== 'MemberExpression') return false
  if (callee.object.type !== 'Identifier') return false
  if (!FASTCHECK_NAMESPACES.has(callee.object.name)) return false
  if (callee.property.type !== 'Identifier') return false
  return CONSTANT_POOL_ARBITRARIES.has(callee.property.name)
}

const boundedPoolIndices = (call: ESTree.CallExpression): ReadonlySet<number> => {
  const bounded = new Set<number>()
  const generators = call.arguments.find(
    (argument): argument is ESTree.ArrayExpression => argument.type === 'ArrayExpression',
  )
  if (generators === undefined) return bounded
  generators.elements.forEach((element, index) => {
    if (isConstantPool(element)) bounded.add(index)
  })
  return bounded
}

const drawnNamesIn = (predicate: PredicateFn, bounded: ReadonlySet<number>): ReadonlySet<string> => {
  const drawn = new Set<string>()
  const addFrom = (value: unknown): void => {
    for (const name of identifiersIn(value)) drawn.add(name)
  }
  const [first, ...rest] = predicate.params
  if (isNode(first) && first.type === 'ArrayPattern') {
    first.elements.forEach((element, index) => {
      if (bounded.has(index)) return
      addFrom(element)
    })
  } else {
    addFrom(first)
  }
  addFrom(rest)
  visit(predicate.body, (node) => {
    if (node.type !== 'VariableDeclarator') return
    if (!touches(node.init, drawn)) return
    addFrom(node.id)
  })
  return drawn
}

const iterationOf = (node: ESTree.Node): Iteration | null => {
  switch (node.type) {
    case 'ForOfStatement':
    case 'ForInStatement':
      return { node, iterable: node.right, body: node.body }
    case 'ForStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
      return { node, iterable: node.test, body: node.body }
    case 'CallExpression': {
      const callee = node.callee
      if (callee.type !== 'MemberExpression') return null
      if (callee.property.type !== 'Identifier') return null
      if (!ITERATOR_METHODS.has(callee.property.name)) return null
      return { node, iterable: callee.object, body: node.arguments[0] }
    }
    default:
      return null
  }
}

const hasFreeCall = (body: unknown, declared: ReadonlySet<string>): boolean => {
  let free = false
  visit(body, (node) => {
    if (node.type !== 'CallExpression' && node.type !== 'NewExpression') return
    if (node.callee.type !== 'Identifier') return
    if (declared.has(node.callee.name)) return
    free = true
  })
  return free
}

const check = (context: Context, call: ESTree.CallExpression, predicate: PredicateFn): void => {
  const declared = declaredNamesIn(predicate)
  const drawn = drawnNamesIn(predicate, boundedPoolIndices(call))
  visit(predicate.body, (node) => {
    const iteration = iterationOf(node)
    if (iteration === null) return
    if (!touches(iteration.iterable, drawn)) return
    if (!hasFreeCall(iteration.body, declared)) return
    context.report({
      node: iteration.node,
      messageId: 'nestedQuantification',
      data: { name: VIOLATION_NAME, expected: EXPECTED, actual: ACTUAL, fix: FIX },
    })
  })
}

/**
 * Admission gate (measured 2026-08-06): across the whole repo (packages/ +
 * omp/, all .ts) this rule reports 0 times — 0% false positives, under the 5%
 * band that licenses `error` severity. A draw from a constant pool is bounded
 * and excluded; DISCHARGED_BY in the suite pins the unbounded recipe shape.
 */
export const noNestedQuantification = defineRule({
  meta,
  create(context: Context) {
    const options = S.decodeUnknownSync(Options)(context.options[0] ?? {})
    const exempt = new Set(options.exempt)
    const basename = context.filename.slice(context.filename.lastIndexOf('/') + 1)
    return {
      CallExpression(node: ESTree.CallExpression) {
        if (exempt.has(basename)) return
        if (!isPropCallee(node.callee)) return
        Option.match(getPredicate(node), {
          onNone: () => {},
          onSome: (predicate) => check(context, node, predicate),
        })
      },
    }
  },
})
