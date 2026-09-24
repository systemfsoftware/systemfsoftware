import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import {
  type BoundaryFunction,
  functionValueOf,
  isEffectModuleBinding,
  isTestOrFixturePath,
  originMemberIs,
  originOf,
  recordFunctionsOf,
  typeRegionsOf,
  walkSubtree,
} from './kernel-boundary.js'
import {
  CLOCK_ACTUAL,
  CLOCK_EXPECTED,
  CLOCK_FIX,
  CLOCK_NAME,
  MATCH_ACTUAL,
  MATCH_FIX,
  MATCH_NAME,
  meta,
  SANDWICH_OWNER,
  SANDWICH_SOURCE,
  SHELL_CONTROL_FIX,
  SHELL_EXPECTED,
  SHELL_LOGICAL_NAME,
  shellControlActual,
  shellControlName,
} from './sandwich-shell-is-straight-line.config.js'

export type Options = []

export type MessageIds = 'controlFlowInShell' | 'matchPipelineInShell' | 'clockReadInWrite'

interface ShellPhase {
  readonly fn: BoundaryFunction
  readonly phase: 'read' | 'write'
}

interface SandwichCell {
  readonly readNode: ESTree.Node | null
  readonly handlersNode: ESTree.Node | null
}

const propertyNameIs = (node: ESTree.Node, name: string): boolean =>
  node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier' &&
  node.property.name === name

const objectOf = (node: ESTree.Node): ESTree.Node | null => node.type === 'MemberExpression' ? node.object : null

/**
 * The Sandwich cells of the file, read off the chain `Sandwich.named(op)(read)
 * .decide(workflow).write(handlers)`: the read is the argument the named
 * builder is invoked with, the handlers are the record passed to `write`. The
 * chain is keyed on the import origin of `Sandwich.named`, so an aliased
 * import is the same gate and a same-named builder from another module is not
 * this gate's boundary.
 */
const collectSandwichCells = (context: Context): readonly SandwichCell[] => {
  const cells: SandwichCell[] = []
  const getScope = context.sourceCode.getScope
  walkSubtree(context.sourceCode.ast, context.sourceCode.visitorKeys, [], (node) => {
    if (node.type !== 'CallExpression' || !propertyNameIs(node.callee, 'write')) return true
    const decideCall = objectOf(node.callee)
    if (decideCall === null || decideCall.type !== 'CallExpression') return true
    if (!propertyNameIs(decideCall.callee, 'decide')) return true
    const invocation = objectOf(decideCall.callee)
    if (invocation === null || invocation.type !== 'CallExpression') return true
    const namedCall = invocation.callee
    if (namedCall.type !== 'CallExpression') return true
    const origin = originOf(namedCall.callee, getScope)
    if (origin === null || origin.source !== SANDWICH_SOURCE) return true
    if (!originMemberIs(origin, SANDWICH_OWNER, 'named')) return true
    cells.push({
      readNode: invocation.arguments[0] ?? null,
      handlersNode: node.arguments[0] ?? null,
    })
    return true
  })
  return cells
}

export const sandwichShellIsStraightLine = defineRule({
  meta,
  create(context: Context) {
    if (isTestOrFixturePath(context.filename)) return {}
    const reportedSpans = new Set<string>()
    const reportedReferences = new Set<string>()
    const visited = new Set<BoundaryFunction>()
    const visitorKeys = context.sourceCode.visitorKeys
    const getScope = context.sourceCode.getScope

    const reportControl = (node: ESTree.Node, name: string, phase: 'read' | 'write'): void => {
      const key = `control:${node.start}:${node.end}`
      if (reportedSpans.has(key)) return
      reportedSpans.add(key)
      context.report({
        node,
        messageId: 'controlFlowInShell',
        data: {
          name,
          expected: SHELL_EXPECTED,
          actual: shellControlActual(phase),
          fix: SHELL_CONTROL_FIX,
        },
      })
    }

    const reportReference = (
      node: ESTree.Node,
      key: string,
      messageId: MessageIds,
      name: string,
      expected: string,
      actual: string,
      fix: string,
    ): void => {
      if (reportedReferences.has(key)) return
      reportedReferences.add(key)
      context.report({ node, messageId, data: { name, expected, actual, fix } })
    }

    const scan = (target: ShellPhase): void => {
      if (visited.has(target.fn)) return
      visited.add(target.fn)
      const regions = typeRegionsOf(target.fn, visitorKeys)
      walkSubtree(target.fn, visitorKeys, regions, (node) => {
        if (node.type === 'LogicalExpression') {
          if (node.operator === '&&' || node.operator === '||') {
            reportControl(node, SHELL_LOGICAL_NAME, target.phase)
          }
        } else {
          const controlName = shellControlName(node.type)
          if (controlName !== undefined) {
            reportControl(node, controlName, target.phase)
            return false
          }
        }
        if (node.type === 'MemberExpression' || node.type === 'Identifier') {
          const origin = originOf(node, getScope)
          if (origin !== null) {
            if (isEffectModuleBinding(origin, 'Match')) {
              reportReference(
                node,
                `match:${origin.source}`,
                'matchPipelineInShell',
                MATCH_NAME,
                SHELL_EXPECTED,
                MATCH_ACTUAL,
                MATCH_FIX,
              )
            }
            if (target.phase === 'write' && isEffectModuleBinding(origin, 'Clock')) {
              reportReference(
                node,
                `clock:${origin.source}`,
                'clockReadInWrite',
                CLOCK_NAME,
                CLOCK_EXPECTED,
                CLOCK_ACTUAL,
                CLOCK_FIX,
              )
            }
          }
        }
        if (node.type === 'CallExpression') {
          const helper = functionValueOf(node.callee, getScope, 0)
          if (helper !== null) scan({ fn: helper, phase: target.phase })
        }
        return true
      })
    }

    return {
      Program() {
        for (const cell of collectSandwichCells(context)) {
          const read = functionValueOf(cell.readNode, getScope, 0)
          if (read !== null) scan({ fn: read, phase: 'read' })
          for (const { fn } of recordFunctionsOf(cell.handlersNode, getScope)) {
            scan({ fn, phase: 'write' })
          }
        }
      },
    }
  },
})
