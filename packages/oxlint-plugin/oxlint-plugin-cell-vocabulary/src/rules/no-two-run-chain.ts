import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  DESCRIPTION_NAMESPACE,
  meta,
  MODULE_SOURCE,
  RUN_NAME,
  SKIPPED_WALK_KEYS,
  TWO_RUN_CHAIN_ACTUAL,
  TWO_RUN_CHAIN_EXPECTED,
  TWO_RUN_CHAIN_FIX,
} from './no-two-run-chain.config.js'

type Walkable = Readonly<Record<string, unknown>>

const isWalkable = (value: unknown): value is Walkable => typeof value === 'object' && value !== null

const nodeType = (node: Walkable): string => String(node['type'])

const isCallExpression = (value: unknown): value is ESTree.CallExpression =>
  isWalkable(value) && nodeType(value) === 'CallExpression'

const isFunctionNode = (value: unknown): boolean => {
  if (!isWalkable(value)) return false
  const kind = nodeType(value)
  return kind === 'FunctionDeclaration' || kind === 'FunctionExpression' ||
    kind === 'ArrowFunctionExpression'
}

export const noTwoRunChain = defineRule({
  meta,
  create(context: Context) {
    const descriptionNamespaces = new Set<string>()

    /**
     * The written receiver of a `Cell.run` call — the namespace object name — or null.
     * The namespace rides the import edge, so an import alias still resolves and a
     * lookalike object never does; a computed member is not a static reference.
     */
    const cellRunReceiver = (node: ESTree.CallExpression): string | null => {
      const callee = node.callee
      if (callee.type !== 'MemberExpression' || callee.computed) return null
      const object = callee.object
      const property = callee.property
      if (object.type !== 'Identifier' || !descriptionNamespaces.has(object.name)) return null
      if (property.type !== 'Identifier' || property.name !== RUN_NAME) return null
      return object.name
    }

    /**
     * Whether the subtree holds a `Cell.run` call without crossing a function boundary:
     * a run written inside a nested closure belongs to that closure's body, never to the
     * scope under analysis.
     */
    const subtreeHoldsRun = (value: unknown): boolean => {
      let found = false
      const visit = (current: unknown): void => {
        if (found || !isWalkable(current) || isFunctionNode(current)) return
        if (isCallExpression(current) && cellRunReceiver(current) !== null) {
          found = true
          return
        }
        for (const key of Object.keys(current)) {
          if (SKIPPED_WALK_KEYS.some((skipped) => skipped === key)) continue
          visit(current[key])
        }
      }
      visit(value)
      return found
    }

    /**
     * Whether the expression reads one of the run-bound names. A member key written
     * beside its object is not a read of that name, so a non-computed property or key
     * is skipped while every computed slot still counts — `Cell.run(cellB, a.field)`
     * reads `a`, while `Cell.run(cellB, other.field)` reads no binding named `field`.
     */
    const expressionReadsBinding = (value: unknown, bindings: ReadonlySet<string>): boolean => {
      let found = false
      const visit = (current: unknown, parent: Walkable | null, parentKey: string | null): void => {
        if (found || !isWalkable(current) || isFunctionNode(current)) return
        if (nodeType(current) === 'Identifier' && typeof current['name'] === 'string') {
          if (bindings.has(current['name'])) {
            if (parent !== null && parentKey === 'property' && nodeType(parent) === 'MemberExpression') {
              if (parent['computed'] !== true) return
            }
            if (parent !== null && parentKey === 'key' && nodeType(parent) === 'Property') {
              if (parent['computed'] !== true) return
            }
            found = true
            return
          }
        }
        for (const key of Object.keys(current)) {
          if (SKIPPED_WALK_KEYS.some((skipped) => skipped === key)) continue
          visit(current[key], current, key)
        }
      }
      visit(value, null, null)
      return found
    }

    /**
     * The identifiers a pattern binds. Every `Property` key is skipped: in a binding
     * pattern the key names the source slot while only the value binds, and a computed
     * slot binds nothing at all.
     */
    const collectBoundNames = (pattern: unknown, bindings: Set<string>): void => {
      const visit = (current: unknown, parent: Walkable | null, parentKey: string | null): void => {
        if (!isWalkable(current)) return
        if (nodeType(current) === 'Identifier') {
          if (parent !== null && parentKey === 'key' && nodeType(parent) === 'Property') return
          const name = current['name']
          if (typeof name === 'string') bindings.add(name)
          return
        }
        for (const key of Object.keys(current)) {
          if (SKIPPED_WALK_KEYS.some((skipped) => skipped === key)) continue
          visit(current[key], current, key)
        }
      }
      visit(pattern, null, null)
    }

    /**
     * Reports a `Cell.run` call whose input reuses an earlier run-bound name: the
     * hand-sequenced pipeline shape that must be an andThen spine instead.
     */
    const judgeRunCall = (node: ESTree.CallExpression, bindings: ReadonlySet<string>): void => {
      const receiver = cellRunReceiver(node)
      if (receiver === null) return
      const chained = node.arguments.some((argument) => expressionReadsBinding(argument, bindings))
      if (!chained) return
      context.report({
        node,
        messageId: 'twoRunChain',
        data: {
          name: `${receiver}.${RUN_NAME}`,
          expected: TWO_RUN_CHAIN_EXPECTED,
          actual: TWO_RUN_CHAIN_ACTUAL,
          fix: TWO_RUN_CHAIN_FIX,
        },
      })
    }

    /**
     * Reports every chained run in the subtree, stopping at nested closures: their runs
     * are judged when their own body is analysed.
     */
    const reportChainedRunsIn = (value: unknown, bindings: ReadonlySet<string>): void => {
      const visit = (current: unknown): void => {
        if (!isWalkable(current) || isFunctionNode(current)) return
        if (isCallExpression(current)) judgeRunCall(current, bindings)
        for (const key of Object.keys(current)) {
          if (SKIPPED_WALK_KEYS.some((skipped) => skipped === key)) continue
          visit(current[key])
        }
      }
      visit(value)
    }

    /**
     * Analyses one body — the program or a single function — in source order: a run is
     * judged against the run-bound names collected from the statements before it, and a
     * declarator or plain assignment extends those names only after its own initialiser
     * has been judged. Parameters and loop variables never enter the set, because only
     * an initialiser holding a `Cell.run` call binds a name here.
     */
    const analyseBody = (body: unknown): void => {
      const bindings = new Set<string>()
      const visit = (current: unknown): void => {
        if (!isWalkable(current) || isFunctionNode(current)) return
        const kind = nodeType(current)
        if (kind === 'VariableDeclarator') {
          const init = current['init']
          if (init === null || init === undefined) return
          reportChainedRunsIn(init, bindings)
          if (subtreeHoldsRun(init)) collectBoundNames(current['id'], bindings)
          return
        }
        if (kind === 'AssignmentExpression' && current['operator'] === '=') {
          const right = current['right']
          reportChainedRunsIn(right, bindings)
          if (subtreeHoldsRun(right)) {
            const left = current['left']
            if (isWalkable(left)) {
              const leftKind = nodeType(left)
              if (
                leftKind === 'Identifier' || leftKind === 'ArrayPattern' ||
                leftKind === 'ObjectPattern'
              ) {
                collectBoundNames(left, bindings)
              }
            }
          }
          return
        }
        if (isCallExpression(current)) judgeRunCall(current, bindings)
        for (const key of Object.keys(current)) {
          if (SKIPPED_WALK_KEYS.some((skipped) => skipped === key)) continue
          visit(current[key])
        }
      }
      visit(body)
    }

    /**
     * Imports are classified here rather than in an `ImportDeclaration` listener.
     * Listeners fire in document order, so a run written above its own import would be
     * judged against an empty set — a silent pass decided by line order, which is the
     * one failure a guard must not have. `Program` sees every top-level statement before
     * any body is analysed, so the set is complete when the first run is judged.
     */
    const classifyImport = (node: ESTree.ImportDeclaration): void => {
      if (node.source.value !== MODULE_SOURCE) return
      for (const specifier of node.specifiers) {
        if (specifier.type === 'ImportNamespaceSpecifier') {
          descriptionNamespaces.add(specifier.local.name)
        } else if (
          specifier.type === 'ImportSpecifier' &&
          specifier.imported.type === 'Identifier' &&
          specifier.imported.name === DESCRIPTION_NAMESPACE
        ) {
          descriptionNamespaces.add(specifier.local.name)
        }
      }
    }

    return {
      Program(node: ESTree.Program) {
        for (const statement of node.body) {
          if (statement.type === 'ImportDeclaration') classifyImport(statement)
        }
        analyseBody(node.body)
        const collectFunctionBodies = (current: unknown): void => {
          if (!isWalkable(current)) return
          if (isFunctionNode(current)) analyseBody(current['body'])
          for (const key of Object.keys(current)) {
            if (SKIPPED_WALK_KEYS.some((skipped) => skipped === key)) continue
            collectFunctionBodies(current[key])
          }
        }
        collectFunctionBodies(node.body)
      },
    }
  },
})
