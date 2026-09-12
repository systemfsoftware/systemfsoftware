import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { ACTUAL, EXPECTED, FIX, meta, VIOLATION_NAME } from './prop-fixture-schema-origin.config.js'

export type MessageIds = 'handRolledRecursiveFixture'

type GetScope = (node: ESTree.Node) => unknown

interface ScopeLike {
  readonly upper: ScopeLike | null
  readonly set: ReadonlyMap<string, { readonly defs: readonly { readonly type: string; readonly node: ESTree.Node }[] }>
}

type LocalKind =
  | { readonly kind: 'function' }
  | { readonly kind: 'import' }
  | { readonly kind: 'init'; readonly init: ESTree.Node }
  | { readonly kind: 'none' }

const MAX_WALK_DEPTH = 32

const isNode = (value: unknown): value is ESTree.Node => value !== null && typeof value === 'object' && 'type' in value

const isImportMetaVitest = (node: ESTree.Node): boolean =>
  node.type === 'MemberExpression' &&
  node.property.type === 'Identifier' &&
  node.property.name === 'vitest' &&
  node.object.type === 'MetaProperty' &&
  node.object.meta.name === 'import' &&
  node.object.property.name === 'meta'

/**
 * Broader than test-placement's condition-only guard: this walks the whole test-expression
 * subtree, so `if (runTests && import.meta.vitest)` is recognised here. Deliberate — plugins
 * do not share code (KTD8), and a test-scope walk that misses a guard silently disarms the rule.
 */
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

const isTestScope = (node: ESTree.Node, filename: string): boolean => {
  if (filename.endsWith('.test.ts')) return true
  for (let current: ESTree.Node | null = node; current !== null; current = current.parent) {
    if (current.type === 'IfStatement' && mentionsImportMetaVitest(current.test)) return true
  }
  return false
}

const isScopeLike = (value: unknown): value is ScopeLike =>
  typeof value === 'object' && value !== null && 'set' in value && 'upper' in value

const resolveLocal = (name: string, node: ESTree.Node, getScope: GetScope): LocalKind => {
  const scope = getScope(node)
  if (!isScopeLike(scope)) return { kind: 'none' }
  for (let current: ScopeLike | null = scope; current !== null; current = current.upper) {
    const variable = current.set.get(name)
    if (variable === undefined) continue
    for (const def of variable.defs) {
      if (def.type === 'ImportBinding') return { kind: 'import' }
      if (def.node.type === 'FunctionDeclaration') return { kind: 'function' }
      if (def.node.type !== 'VariableDeclarator') continue
      if (def.node.init === null) continue
      return { kind: 'init', init: def.node.init }
    }
    return { kind: 'none' }
  }
  return { kind: 'none' }
}

const isNamedBuilder = (name: string, node: ESTree.Node, getScope: GetScope): boolean => {
  const resolved = resolveLocal(name, node, getScope)
  if (resolved.kind === 'function' || resolved.kind === 'import') return true
  return (
    resolved.kind === 'init' &&
    (resolved.init.type === 'ArrowFunctionExpression' || resolved.init.type === 'FunctionExpression')
  )
}

/** The identifier thunk of a `Schema.suspend(...)` / `S.suspend(...)` binding, when the name resolves to one. */
const suspendThunkOf = (name: string, node: ESTree.Node, getScope: GetScope): ESTree.Node | undefined => {
  const resolved = resolveLocal(name, node, getScope)
  if (resolved.kind !== 'init') return undefined
  const { init } = resolved
  if (init.type !== 'CallExpression') return undefined
  const { callee } = init
  if (callee.type !== 'MemberExpression' || callee.computed) return undefined
  if (callee.property.type !== 'Identifier' || callee.property.name !== 'suspend') return undefined
  return init.arguments[0]
}

const mentionsIdentifier = (value: unknown, name: string, depth: number): boolean => {
  if (depth > MAX_WALK_DEPTH) return false
  if (Array.isArray(value)) return value.some((item) => mentionsIdentifier(item, name, depth + 1))
  if (!isNode(value)) return false
  if (value.type === 'Identifier') return value.name === name
  for (const [key, child] of Object.entries(value)) {
    if (key === 'parent') continue
    if (mentionsIdentifier(child, name, depth + 1)) return true
  }
  return false
}

const collectIdentifierNames = (value: unknown, out: string[], depth: number): void => {
  if (depth > MAX_WALK_DEPTH) return
  if (Array.isArray(value)) {
    for (const item of value) collectIdentifierNames(item, out, depth + 1)
    return
  }
  if (!isNode(value)) return
  if (value.type === 'Identifier') {
    out.push(value.name)
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'parent') continue
    collectIdentifierNames(child, out, depth + 1)
  }
}

/** Walks up from a node to the variable it is assigned to, when the binding is a plain identifier. */
const bindingNameOf = (node: ESTree.Node): string | undefined => {
  for (let current: ESTree.Node | null = node; current !== null; current = current.parent) {
    if (current.type === 'VariableDeclarator') return current.id.type === 'Identifier' ? current.id.name : undefined
  }
  return undefined
}

const unionMembersOf = (union: ESTree.CallExpression): ReadonlyArray<ESTree.Node> => {
  const first = union.arguments[0]
  if (first !== undefined && first.type === 'ArrayExpression') {
    return first.elements.filter((element) => element !== null)
  }
  return union.arguments
}

const memberNamesOf = (union: ESTree.CallExpression): ReadonlyArray<string> => {
  const names: string[] = []
  for (const member of unionMembersOf(union)) {
    if (member.type === 'Identifier') {
      names.push(member.name)
      continue
    }
    if (member.type === 'SpreadElement' && member.argument.type === 'Identifier') names.push(member.argument.name)
  }
  return names
}

const isRecursiveUnion = (union: ESTree.CallExpression, getScope: GetScope): boolean => {
  const binding = bindingNameOf(union)
  const reachesBinding = (name: string, seen: Set<string>): boolean => {
    if (seen.has(name)) return false
    seen.add(name)
    const thunk = suspendThunkOf(name, union, getScope)
    if (thunk === undefined) return false
    if (binding !== undefined && mentionsIdentifier(thunk, binding, 0)) return true
    const nestedNames: string[] = []
    collectIdentifierNames(thunk, nestedNames, 0)
    return nestedNames.some(
      (nested) => suspendThunkOf(nested, union, getScope) !== undefined && reachesBinding(nested, seen),
    )
  }
  return memberNamesOf(union).some((name) => reachesBinding(name, new Set()))
}

const annotateCallOf = (union: ESTree.CallExpression): ESTree.CallExpression | undefined => {
  const member = union.parent
  if (member.type !== 'MemberExpression') return undefined
  if (member.object !== union) return undefined
  if (member.property.type !== 'Identifier' || member.property.name !== 'annotate') return undefined
  const call = member.parent
  return call.type === 'CallExpression' && call.callee === member ? call : undefined
}

const declaresGenerationIntent = (annotate: ESTree.CallExpression): boolean => {
  const options = annotate.arguments[0]
  if (options === undefined || options.type !== 'ObjectExpression') return false
  return options.properties.some(
    (property) =>
      property.type === 'Property' &&
      property.key.type === 'Identifier' &&
      (property.key.name === 'toArbitrary' || property.key.name === 'recursionBudget'),
  )
}

/**
 * The node kinds the origin walk holds: every one carries a parent, and the root — `Program`, the
 * only parentless node — is unreachable from a call expression through this chain.
 */
type BuilderChainNode =
  | ESTree.CallExpression
  | ESTree.VariableDeclarator
  | ESTree.ReturnStatement
  | ESTree.BlockStatement

/**
 * Sanctioned origins (a) and (b): the union is the body or argument of an inline function passed to a
 * named local builder or an imported helper, optionally through a `.annotate(...)` chain. An IIFE is
 * not sanctioned — its callee is the inline function itself, not a named binding — so it reports.
 */
const isNamedBuilderOrigin = (union: ESTree.CallExpression, getScope: GetScope): boolean => {
  let current: BuilderChainNode = union
  for (let depth = 0; depth <= MAX_WALK_DEPTH; depth += 1) {
    const parent: ESTree.Node = current.parent
    if (parent.type === 'ArrowFunctionExpression' || parent.type === 'FunctionExpression') {
      const call: ESTree.Node = parent.parent
      if (call.type !== 'CallExpression') return false
      if (call.callee.type !== 'Identifier') return false
      return isNamedBuilder(call.callee.name, call, getScope)
    }
    if (parent.type === 'CallExpression') {
      if (!parent.arguments.some((argument) => argument === current)) return false
      if (parent.callee.type !== 'Identifier') return false
      return isNamedBuilder(parent.callee.name, parent, getScope)
    }
    if (parent.type === 'MemberExpression' && parent.object === current) {
      const call: ESTree.Node = parent.parent
      if (call.type !== 'CallExpression' || call.callee !== parent) return false
      current = call
      continue
    }
    if (parent.type === 'VariableDeclarator' || parent.type === 'ReturnStatement' || parent.type === 'BlockStatement') {
      current = parent
      continue
    }
    return false
  }
  return false
}

export const propFixtureSchemaOrigin = defineRule({
  meta,
  create(context: Context) {
    const getScope: GetScope = context.sourceCode.getScope
    return {
      CallExpression(node: ESTree.CallExpression) {
        const { callee } = node
        if (callee.type !== 'MemberExpression' || callee.computed) return
        if (callee.property.type !== 'Identifier' || callee.property.name !== 'Union') return
        if (callee.object.type !== 'Identifier') return
        if (!isTestScope(node, context.filename)) return
        if (!isRecursiveUnion(node, getScope)) return
        const annotate = annotateCallOf(node)
        if (annotate !== undefined && declaresGenerationIntent(annotate)) return
        if (isNamedBuilderOrigin(node, getScope)) return
        context.report({
          node,
          messageId: 'handRolledRecursiveFixture',
          data: { name: VIOLATION_NAME, expected: EXPECTED, actual: ACTUAL, fix: FIX },
        })
      },
    }
  },
})
