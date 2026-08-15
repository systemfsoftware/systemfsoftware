import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  ENTRYPOINT_FILE,
  meta,
  MISSING_EDGE_ACTUAL,
  MISSING_EDGE_EXPECTED,
  MISSING_EDGE_FIX,
  MISSING_EDGE_NAME,
  MULTIPLE_EDGES_ACTUAL,
  MULTIPLE_EDGES_EXPECTED,
  MULTIPLE_EDGES_FIX,
  QUALIFIED_EDGE_CALLEES,
  RUN_MAIN,
} from './entrypoint-interprets-once.config.js'

export type MessageIds = 'missingEdge' | 'multipleEdges'

const isEntrypointFile = (filename: string): boolean => ENTRYPOINT_FILE.test(filename)

const edgeName = (callee: ESTree.CallExpression['callee']): string | null => {
  if (callee.type === 'Identifier') return callee.name === RUN_MAIN ? RUN_MAIN : null
  if (callee.type !== 'MemberExpression') return null
  if (callee.computed) return null

  const property = callee.property
  if (property.type !== 'Identifier') return null

  const object = callee.object
  if (object.type !== 'Identifier') return property.name === RUN_MAIN ? property.name : null

  const qualified = `${object.name}.${property.name}`
  if (property.name === RUN_MAIN) return qualified
  return QUALIFIED_EDGE_CALLEES.has(qualified) ? qualified : null
}

export const entrypointInterpretsOnce = defineRule({
  meta,
  create(context: Context) {
    if (!isEntrypointFile(context.filename)) return {}

    const edges: { node: ESTree.Node; name: string }[] = []

    return {
      CallExpression(node: ESTree.CallExpression) {
        const name = edgeName(node.callee)
        if (name !== null) edges.push({ node, name })
      },

      'Program:exit'(node: ESTree.Program) {
        if (edges.length === 0) {
          context.report({
            node,
            messageId: 'missingEdge',
            data: {
              name: MISSING_EDGE_NAME,
              expected: MISSING_EDGE_EXPECTED,
              actual: MISSING_EDGE_ACTUAL,
              fix: MISSING_EDGE_FIX,
            },
          })
          return
        }

        if (edges.length === 1) return

        for (const edge of edges) {
          context.report({
            node: edge.node,
            messageId: 'multipleEdges',
            data: {
              name: edge.name,
              expected: MULTIPLE_EDGES_EXPECTED,
              actual: MULTIPLE_EDGES_ACTUAL,
              fix: MULTIPLE_EDGES_FIX,
            },
          })
        }
      },
    }
  },
})
