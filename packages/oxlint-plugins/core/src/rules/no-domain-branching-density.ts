import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'

import { boundariesContaining, collectMakeBoundaries, type MakeBoundary } from './make-boundary.kernel.js'
import { isTestFile, meta, Options } from './no-domain-branching-density.config.js'

export type MessageIds = 'maxComplexity'

type FunctionNode =
  | ESTree.ArrowFunctionExpression
  | (ESTree.Function & {
    readonly type: 'FunctionDeclaration' | 'FunctionExpression'
  })

/** Per-function decision points of the syntactic McCabe count (base of 1). */
const DECISION_POINT_TYPES: Readonly<Record<string, true>> = {
  IfStatement: true,
  SwitchCase: true,
  ConditionalExpression: true,
  ForStatement: true,
  ForInStatement: true,
  ForOfStatement: true,
  WhileStatement: true,
  DoWhileStatement: true,
  CatchClause: true,
}

/** Short-circuit operators that decide the evaluation path. `??` is not a decision: either side runs at most once regardless. */
const SHORT_CIRCUIT_OPERATORS: Readonly<Record<string, true>> = {
  '&&': true,
  '||': true,
}

const isNode = (value: unknown): value is ESTree.Node => typeof value === 'object' && value !== null && 'type' in value

const isWalkable = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isFunctionNode = (node: ESTree.Node): node is FunctionNode =>
  node.type === 'FunctionDeclaration' ||
  node.type === 'FunctionExpression' ||
  node.type === 'ArrowFunctionExpression'

const isDecisionPoint = (node: ESTree.Node): boolean => {
  if (DECISION_POINT_TYPES[node.type] === true) return true
  if (node.type !== 'LogicalExpression') return false
  return SHORT_CIRCUIT_OPERATORS[node.operator] === true
}

/** A human-readable name from the binding site, not the scope tree. */
const functionNameOf = (node: FunctionNode): string => {
  if (node.id !== null && node.id !== undefined) return node.id.name
  const parent: ESTree.Node | null = node.parent
  if (parent !== null) {
    switch (parent.type) {
      case 'VariableDeclarator':
        return parent.id.type === 'Identifier' ? parent.id.name : '<anonymous>'
      case 'Property':
        return keyNameOf(parent.key)
      case 'MethodDefinition':
        return keyNameOf(parent.key)
      case 'AssignmentExpression':
        return parent.left.type === 'Identifier' ? parent.left.name : '<anonymous>'
    }
  }
  return '<anonymous>'
}

/** The enclosing name of a property or method key, when the key is static. */
const keyNameOf = (node: ESTree.Node): string => {
  if (node.type === 'Identifier') return node.name
  if (node.type === 'Literal') return node.value === null ? 'null' : String(node.value)
  return '<anonymous>'
}

/**
 * Syntactic cyclomatic complexity of `fn`: 1 + decision points in its own
 * subtree. Nested functions own their own complexity — walked over, never
 * counted into the enclosing function.
 */
const complexityOf = (
  fn: FunctionNode,
  visitorKeys: Readonly<Record<string, readonly string[]>>,
): number => {
  let complexity = 1
  const walk = (node: ESTree.Node): void => {
    if (node !== fn && isFunctionNode(node)) return
    if (isDecisionPoint(node)) complexity += 1
    const record = isWalkable(node) ? node : null
    if (record === null) return
    for (const key of visitorKeys[node.type] ?? []) {
      const value = record[key]
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (isNode(entry)) walk(entry)
        }
      } else if (isNode(value)) {
        walk(value)
      }
    }
  }
  walk(fn)
  return complexity
}

const visitSubtree = (
  node: ESTree.Node,
  visitorKeys: Readonly<Record<string, readonly string[]>>,
  visit: (node: ESTree.Node) => void,
): void => {
  visit(node)
  const record = isWalkable(node) ? node : null
  if (record === null) return
  for (const key of visitorKeys[node.type] ?? []) {
    const value = record[key]
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (isNode(entry)) visitSubtree(entry, visitorKeys, visit)
      }
    } else if (isNode(value)) {
      visitSubtree(value, visitorKeys, visit)
    }
  }
}

/**
 * The KTD-branching ceiling over everything outside a `Workflow.make` body:
 * a function's syntactic cyclomatic complexity may not exceed the ceiling.
 * Domain branching outside make bodies has no legal home except extraction.
 * Functions whose span lies inside a resolved make body are exempt — the
 * purity gate already holds them to one converging guard.
 */
export const noDomainBranchingDensity = defineRule({
  meta,
  create(context: Context) {
    if (isTestFile(context.filename)) return {}
    const options = S.decodeUnknownSync(Options)(context.options[0] ?? {})
    const max = options.max

    return {
      Program() {
        const boundaries: readonly MakeBoundary[] = collectMakeBoundaries(context)
        // No boundary in the file: skip the (allocating) containment filter per
        // function entirely — every function is domain code and judged.
        const noBoundaries = boundaries.length === 0
        const visitorKeys = context.sourceCode.visitorKeys
        const visit = (node: ESTree.Node): void => {
          if (!isFunctionNode(node)) return
          if (!noBoundaries && boundariesContaining(node, boundaries).length > 0) return
          const complexity = complexityOf(node, visitorKeys)
          if (complexity <= max) return
          context.report({
            node,
            messageId: 'maxComplexity',
            data: {
              name: `Function '${functionNameOf(node)}'`,
              expected: `a cyclomatic complexity of at most ${max}`,
              actual: `a cyclomatic complexity of ${complexity}`,
              fix:
                `Extract the domain branching into functions of one concern each until every function fits the ceiling; branching outside Workflow.make bodies has no legal home, and code that defends nothing gets deleted, not rehoused.`,
            },
          })
        }
        for (const statement of context.sourceCode.ast.body) {
          visitSubtree(statement, visitorKeys, visit)
        }
      },
    }
  },
})
