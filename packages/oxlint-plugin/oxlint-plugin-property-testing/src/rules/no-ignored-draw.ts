import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Option } from 'effect'
import {
  CONSTANT_ACTUAL,
  CONSTANT_EXPECTED,
  CONSTANT_FIX,
  CONSTANT_NAME,
  CONSTANT_POOL_ARBITRARIES,
  FASTCHECK_NAMESPACES,
  meta,
  SUPPRESSED_ACTUAL,
  SUPPRESSED_EXPECTED,
  SUPPRESSED_FIX,
  SUPPRESSED_NAME,
  UNREFERENCED_ACTUAL,
  UNREFERENCED_EXPECTED,
  UNREFERENCED_FIX,
  UNREFERENCED_NAME,
} from './no-ignored-draw.config.js'
import { getPredicate, isPropCallee, type PredicateFn } from './prop-call.js'

export type MessageIds = 'suppressedDraw' | 'constantArbitrary' | 'unreferencedDraw'

const isNode = (value: unknown): value is ESTree.Node => value !== null && typeof value === 'object' && 'type' in value

const isImportMetaVitest = (node: ESTree.Node): boolean =>
  node.type === 'MemberExpression' &&
  node.property.type === 'Identifier' &&
  node.property.name === 'vitest' &&
  node.object.type === 'MetaProperty' &&
  node.object.meta.name === 'import' &&
  node.object.property.name === 'meta'

const mentionsImportMetaVitest = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(mentionsImportMetaVitest)
  if (!isNode(value)) return false
  if (isImportMetaVitest(value)) return true
  for (const [key, child] of Object.entries(value)) {
    if (key === 'parent') continue
    if (mentionsImportMetaVitest(child)) return true
  }
  return false
}

const visit = (value: unknown, onNode: (node: ESTree.Node) => void): void => {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, onNode)
    return
  }
  if (!isNode(value)) return
  onNode(value)
  for (const [key, child] of Object.entries(value)) {
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

const unwrap = (node: ESTree.Node): ESTree.Node => {
  let current = node
  for (;;) {
    if (current.type === 'ChainExpression') {
      current = current.expression
      continue
    }
    if (
      current.type === 'TSAsExpression' ||
      current.type === 'TSSatisfiesExpression' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'TSTypeAssertion'
    ) {
      current = current.expression
      continue
    }
    return current
  }
}

const isConstantPool = (element: unknown): boolean => {
  if (!isNode(element)) return false
  const unwrapped = unwrap(element)
  if (unwrapped.type !== 'CallExpression') return false
  const callee = unwrapped.callee
  if (callee.type !== 'MemberExpression') return false
  if (callee.object.type !== 'Identifier') return false
  if (FASTCHECK_NAMESPACES[callee.object.name] !== true) return false
  if (callee.property.type !== 'Identifier') return false
  return CONSTANT_POOL_ARBITRARIES[callee.property.name] === true
}

const patternNamesIn = (pattern: unknown, out: string[]): void => {
  if (!isNode(pattern)) return
  switch (pattern.type) {
    case 'Identifier':
      out.push(pattern.name)
      return
    case 'ArrayPattern':
      for (const element of pattern.elements) {
        if (element === null) continue
        patternNamesIn(element, out)
      }
      return
    case 'ObjectPattern':
      for (const property of pattern.properties) {
        if (property.type === 'Property') patternNamesIn(property.value, out)
        else patternNamesIn(property.argument, out)
      }
      return
    case 'RestElement':
      patternNamesIn(pattern.argument, out)
      return
    case 'AssignmentPattern':
      patternNamesIn(pattern.left, out)
      return
    default:
      for (const name of identifiersIn(pattern)) out.push(name)
      return
  }
}

const drawNamesOf = (predicate: PredicateFn): readonly string[] => {
  const names: string[] = []
  for (const param of predicate.params) patternNamesIn(param, names)
  return names
}

const isSuppressed = (predicate: PredicateFn): boolean => {
  const first = predicate.params[0]
  if (first === undefined || !isNode(first) || first.type !== 'ArrayPattern') return false
  const elements = first.elements.filter((element) => element !== null)
  if (elements.length === 0) return false
  for (const element of elements) {
    const names = identifiersIn(element)
    if (names.size === 0) return false
    for (const name of names) {
      if (!name.startsWith('_')) return false
    }
  }
  return true
}

const isUnreferenced = (predicate: PredicateFn, draws: readonly string[]): boolean => {
  if (draws.length === 0) return false
  const used = identifiersIn(predicate.body)
  for (const name of draws) {
    if (used.has(name)) return false
  }
  return true
}

const checkPropCall = (context: Context, call: ESTree.CallExpression): void => {
  const arbitraries = call.arguments.find(
    (argument): argument is ESTree.ArrayExpression => argument.type === 'ArrayExpression',
  )
  const elements = arbitraries === undefined ? [] : arbitraries.elements
  for (const element of elements) {
    if (element === null) continue
    if (!isConstantPool(element)) continue
    context.report({
      node: element,
      messageId: 'constantArbitrary',
      data: { name: CONSTANT_NAME, expected: CONSTANT_EXPECTED, actual: CONSTANT_ACTUAL, fix: CONSTANT_FIX },
    })
  }
  Option.match(getPredicate(call), {
    onNone: () => {},
    onSome: (predicate) => {
      if (isSuppressed(predicate)) {
        context.report({
          node: predicate,
          messageId: 'suppressedDraw',
          data: {
            name: SUPPRESSED_NAME,
            expected: SUPPRESSED_EXPECTED,
            actual: SUPPRESSED_ACTUAL,
            fix: SUPPRESSED_FIX,
          },
        })
        return
      }
      if (isUnreferenced(predicate, drawNamesOf(predicate))) {
        context.report({
          node: predicate,
          messageId: 'unreferencedDraw',
          data: {
            name: UNREFERENCED_NAME,
            expected: UNREFERENCED_EXPECTED,
            actual: UNREFERENCED_ACTUAL,
            fix: UNREFERENCED_FIX,
          },
        })
      }
    },
  })
}

export const noIgnoredDraw = defineRule({
  meta,
  create(context: Context) {
    const collect = (value: unknown, out: ESTree.CallExpression[]): void => {
      if (Array.isArray(value)) {
        for (const item of value) collect(item, out)
        return
      }
      if (!isNode(value)) return
      if (value.type === 'IfStatement' && mentionsImportMetaVitest(value.test)) return
      if (value.type === 'CallExpression' && isPropCallee(value.callee)) out.push(value)
      for (const [key, child] of Object.entries(value)) {
        if (key === 'parent') continue
        collect(child, out)
      }
    }
    return {
      IfStatement(node: ESTree.IfStatement) {
        if (!mentionsImportMetaVitest(node.test)) return
        const calls: ESTree.CallExpression[] = []
        collect(node.consequent, calls)
        collect(node.alternate, calls)
        for (const call of calls) checkPropCall(context, call)
      },
    }
  },
})
