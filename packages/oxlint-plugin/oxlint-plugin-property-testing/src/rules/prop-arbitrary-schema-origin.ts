import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Option } from 'effect'
import {
  ACTUAL,
  COMBINATOR_CALLEES,
  EFFECT_SOURCE,
  EXPECTED,
  FASTCHECK_NAMESPACE_NAMES,
  FASTCHECK_PACKAGE,
  FIX,
  meta,
  SCHEMA_NAMESPACE_NAMES,
  SCHEMA_SOURCE_PATTERN,
  VIOLATION_NAME,
} from './prop-arbitrary-schema-origin.config.js'
import { isPropCallee } from './prop-call.js'

export type MessageIds = 'handBuiltArbitrary'

type Verdict = 'schema' | 'handBuilt' | 'opaque'

type GetScope = (node: ESTree.Node) => unknown

interface ImportEdge {
  readonly source: string
  readonly imported: string | null
}

type LocalBinding =
  | { readonly kind: 'import' }
  | { readonly kind: 'init'; readonly init: ESTree.Node }
  | { readonly kind: 'none' }

interface ScopeLike {
  readonly upper: ScopeLike | null
  readonly set: ReadonlyMap<string, { readonly defs: readonly { readonly type: string; readonly node: ESTree.Node }[] }>
}

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
 * Broader than test-placement's condition-only `isVitestGuard`: this walks the whole
 * test-expression subtree, so a guard like `if (runTests && import.meta.vitest)` is
 * recognised here. Deliberate — plugins do not share code (KTD8).
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

const isScopeLike = (value: unknown): value is ScopeLike =>
  typeof value === 'object' && value !== null && 'set' in value && 'upper' in value

const resolveLocal = (name: string, node: ESTree.Node, getScope: GetScope): LocalBinding => {
  const scope = getScope(node)
  if (!isScopeLike(scope)) return { kind: 'none' }
  for (let current: ScopeLike | null = scope; current !== null; current = current.upper) {
    const variable = current.set.get(name)
    if (variable === undefined) continue
    for (const def of variable.defs) {
      if (def.type === 'ImportBinding') return { kind: 'import' }
      if (def.node.type !== 'VariableDeclarator') continue
      const init = Option.fromNullishOr(def.node.init)
      if (Option.isSome(init)) return { kind: 'init', init: init.value }
    }
    return { kind: 'none' }
  }
  return { kind: 'none' }
}

const vocabularyOf = (edge: ImportEdge): Verdict => {
  if (SCHEMA_SOURCE_PATTERN.test(edge.source)) return 'schema'
  if (edge.source === EFFECT_SOURCE && edge.imported !== null) {
    if (SCHEMA_NAMESPACE_NAMES[edge.imported] === true) return 'schema'
    if (FASTCHECK_NAMESPACE_NAMES[edge.imported] === true) return 'handBuilt'
  }
  if (edge.source === FASTCHECK_PACKAGE || edge.source.startsWith(`${FASTCHECK_PACKAGE}/`)) return 'handBuilt'
  return 'opaque'
}

class Provenance {
  readonly imports = new Map<string, ImportEdge>()

  constructor(readonly getScope: GetScope) {}

  verdictOf(expr: ESTree.Node | null, depth: number): Verdict {
    if (depth > MAX_WALK_DEPTH || !isNode(expr)) return 'opaque'
    switch (expr.type) {
      case 'ChainExpression':
        return this.verdictOf(expr.expression, depth + 1)
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'TSTypeAssertion':
        return this.verdictOf(expr.expression, depth + 1)
      case 'Identifier': {
        const resolved = resolveLocal(expr.name, expr, this.getScope)
        if (resolved.kind === 'import') {
          const edge = this.imports.get(expr.name)
          return edge === undefined ? 'opaque' : vocabularyOf(edge)
        }
        if (resolved.kind === 'init') return this.verdictOf(resolved.init, depth + 1)
        return 'opaque'
      }
      case 'MemberExpression':
        return this.verdictOf(expr.object, depth + 1)
      case 'Literal':
        return 'handBuilt'
      case 'ObjectExpression':
        return this.objectVerdictOf(expr, depth)
      case 'ArrayExpression':
        return this.reduceArgs(expr.elements, depth)
      case 'CallExpression':
        return this.callVerdictOf(expr, depth)
      default:
        return 'opaque'
    }
  }

  private callVerdictOf(call: ESTree.CallExpression, depth: number): Verdict {
    const callee = call.callee
    if (callee.type === 'MemberExpression') {
      const receiver = this.verdictOf(callee.object, depth + 1)
      if (receiver === 'schema') return 'schema'
      if (receiver === 'opaque') return 'opaque'
      return this.reduceArgs(call.arguments, depth)
    }
    if (callee.type === 'Identifier' && COMBINATOR_CALLEES[callee.name] === true) {
      return this.reduceArgs(call.arguments, depth)
    }
    const calleeVerdict = this.verdictOf(callee, depth + 1)
    if (calleeVerdict === 'schema') return 'schema'
    if (calleeVerdict === 'opaque') return 'opaque'
    return this.reduceArgs(call.arguments, depth)
  }

  private objectVerdictOf(object: ESTree.ObjectExpression, depth: number): Verdict {
    let sawOpaque = false
    for (const property of object.properties) {
      if (property.type !== 'Property' || property.computed) {
        sawOpaque = true
        continue
      }
      const verdict = this.verdictOf(property.value, depth + 1)
      if (verdict === 'schema') return 'schema'
      if (verdict === 'opaque') sawOpaque = true
    }
    return sawOpaque ? 'opaque' : 'handBuilt'
  }

  private reduceArgs(args: readonly (ESTree.Expression | ESTree.SpreadElement | null)[], depth: number): Verdict {
    let sawOpaque = false
    for (const arg of args) {
      if (arg === null) {
        sawOpaque = true
        continue
      }
      if (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression') continue
      const verdict = this.verdictOf(arg, depth + 1)
      if (verdict === 'schema') return 'schema'
      if (verdict === 'opaque') sawOpaque = true
    }
    return sawOpaque ? 'opaque' : 'handBuilt'
  }
}

const checkPropCall = (provenance: Provenance, context: Context, call: ESTree.CallExpression): void => {
  const arbitraries = call.arguments.find(
    (argument): argument is ESTree.ArrayExpression => argument.type === 'ArrayExpression',
  )
  if (arbitraries === undefined) return
  for (const element of arbitraries.elements) {
    if (element === null) continue
    if (provenance.verdictOf(element, 0) !== 'handBuilt') continue
    context.report({
      node: element,
      messageId: 'handBuiltArbitrary',
      data: { name: VIOLATION_NAME, expected: EXPECTED, actual: ACTUAL, fix: FIX },
    })
  }
}

export const propArbitrarySchemaOrigin = defineRule({
  meta,
  create(context: Context) {
    const provenance = new Provenance(context.sourceCode.getScope)
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
      Program(node: ESTree.Program) {
        for (const statement of node.body) {
          if (statement.type !== 'ImportDeclaration') continue
          const source = statement.source.value
          for (const specifier of statement.specifiers) {
            if (specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier') {
              provenance.imports.set(specifier.local.name, { source, imported: specifier.imported.name })
            } else {
              provenance.imports.set(specifier.local.name, { source, imported: null })
            }
          }
        }
      },
      IfStatement(node: ESTree.IfStatement) {
        if (!mentionsImportMetaVitest(node.test)) return
        const calls: ESTree.CallExpression[] = []
        collect(node.consequent, calls)
        collect(node.alternate, calls)
        for (const call of calls) checkPropCall(provenance, context, call)
      },
    }
  },
})
