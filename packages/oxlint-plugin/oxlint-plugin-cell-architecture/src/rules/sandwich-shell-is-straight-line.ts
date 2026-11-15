import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import {
  type BoundaryFunction,
  dispatchCalleeName,
  functionValueOf,
  initializerOf,
  isEffectModuleBinding,
  isTestOrFixturePath,
  originMemberIs,
  originOf,
  propertyNameIs,
  recordFunctionsOf,
  typeRegionsOf,
  walkSubtree,
} from './kernel-boundary.js'
import {
  CLOCK_ACTUAL,
  CLOCK_EXPECTED,
  CLOCK_FIX,
  CLOCK_NAME,
  dispatchActual,
  dispatchName,
  MATCH_ACTUAL,
  MATCH_FIX,
  MATCH_NAME,
  meta,
  SANDWICH_CHAINS,
  SANDWICH_OWNER,
  SANDWICH_SOURCE,
  SHELL_CONTROL_FIX,
  SHELL_DISPATCH_FIX,
  SHELL_EXPECTED,
  SHELL_LOGICAL_NAME,
  shellControlActual,
  shellControlName,
} from './sandwich-shell-is-straight-line.config.js'

export type Options = []

export type MessageIds = 'controlFlowInShell' | 'dispatchInShell' | 'matchPipelineInShell' | 'clockReadInWrite'

interface ShellPhase {
  readonly fn: BoundaryFunction
  readonly phase: 'read' | 'write'
}

interface SandwichCell {
  readonly readNode: ESTree.Node | null
  readonly handlersNode: ESTree.Node | null
}

const objectOf = (node: ESTree.Node): ESTree.Node | null => node.type === 'MemberExpression' ? node.object : null

/** A link of the chain, read through the `const` bindings it was split across. */
const throughConst = (
  node: ESTree.Node | null,
  getScope: (node: ESTree.Node) => unknown,
  depth = 0,
): ESTree.Node | null => {
  if (node === null || node.type !== 'Identifier' || depth > 8) return node
  const init = initializerOf(node, getScope)
  return init === null ? node : throughConst(init, getScope, depth + 1)
}

/**
 * The Sandwich cells of the file, read off the chain `Sandwich.named(op)(read)
 * .decide(workflow).write(handlers)`: the read is the argument the named
 * builder is invoked with, the handlers are the record passed to `write`. The
 * chain is keyed on the import origin of `Sandwich.named`, so an aliased
 * import is the same gate and a same-named builder from another module is not
 * this gate's boundary. Each link is read through the `const` bindings a chain
 * is split across, and the builder through its options-first form.
 */
const collectSandwichCells = (context: Context): readonly SandwichCell[] => {
  const cells: SandwichCell[] = []
  const getScope = context.sourceCode.getScope
  walkSubtree(context.sourceCode.ast, context.sourceCode.visitorKeys, [], (node) => {
    if (node.type !== 'CallExpression' || !propertyNameIs(node.callee, 'write')) return true
    const middleCall = throughConst(objectOf(node.callee), getScope)
    if (middleCall === null || middleCall.type !== 'CallExpression') return true
    const builder = SANDWICH_CHAINS.find((chain) => propertyNameIs(middleCall.callee, chain.middle))
    if (builder === undefined) return true
    const invocation = throughConst(objectOf(middleCall.callee), getScope)
    if (invocation === null || invocation.type !== 'CallExpression') return true
    const builderCall = throughConst(invocation.callee, getScope)
    if (builderCall === null || builderCall.type !== 'CallExpression') return true
    const builderHead = throughConst(builderCall.callee, getScope)
    if (builderHead === null) return true
    const builderRef = builderHead.type === 'CallExpression' ? builderHead.callee : builderHead
    const origin = originOf(builderRef, getScope)
    if (origin === null || origin.source !== SANDWICH_SOURCE) return true
    if (!originMemberIs(origin, SANDWICH_OWNER, builder.builder)) return true
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
            const callee = dispatchCalleeName(origin)
            if (callee !== null) {
              reportReference(
                node,
                `dispatch:${callee}`,
                'dispatchInShell',
                dispatchName(callee),
                SHELL_EXPECTED,
                dispatchActual(target.phase),
                SHELL_DISPATCH_FIX,
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
