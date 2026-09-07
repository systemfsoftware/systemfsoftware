import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  cellRunReceiver,
  classifyDescriptionImport,
  isCallExpression,
  isFunctionNode,
  isWalkable,
  nodeType,
  subtreeHoldsRun,
  type Walkable,
} from './cell.js'
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

export const noTwoRunChain = defineRule({
  meta,
  create(context: Context) {
    const descriptionNamespaces = new Set<string>()

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
      const receiver = cellRunReceiver(node, descriptionNamespaces, RUN_NAME)
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
          if (subtreeHoldsRun(init, descriptionNamespaces, RUN_NAME)) collectBoundNames(current['id'], bindings)
          return
        }
        if (kind === 'AssignmentExpression' && current['operator'] === '=') {
          const right = current['right']
          reportChainedRunsIn(right, bindings)
          if (subtreeHoldsRun(right, descriptionNamespaces, RUN_NAME)) {
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

    return {
      Program(node: ESTree.Program) {
        for (const statement of node.body) {
          if (statement.type === 'ImportDeclaration') {
            classifyDescriptionImport(statement, descriptionNamespaces, MODULE_SOURCE, DESCRIPTION_NAMESPACE)
          }
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
