import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { calleeRootName, cellOf, isExecutorFile } from './cell.js'
import {
  IO_CALL_ACTUAL,
  IO_CELLS,
  IO_IN_FILLING_EXPECTED,
  IO_IN_FILLING_FIX,
  meta,
  SKIPPED_WALK_KEYS,
  SUSPENSION_ACTUAL,
  SUSPENSION_TYPES,
} from './executor-no-io-in-filling.config.js'

export type MessageIds = 'ioInWorkflowArgument'

type Walkable = Readonly<Record<string, unknown>>

const isWalkable = (value: unknown): value is Walkable => typeof value === 'object' && value !== null

const nodeType = (node: Walkable): string => String(node['type'])

const walk = (value: unknown, visit: (node: Walkable) => void): void => {
  if (!isWalkable(value)) return
  visit(value)
  for (const key of Object.keys(value)) {
    if (SKIPPED_WALK_KEYS.some((skipped) => skipped === key)) continue
    walk(value[key], visit)
  }
}

const rootNameOf = (value: unknown): string | null => {
  if (!isWalkable(value)) return null
  if (nodeType(value) === 'Identifier') return String(value['name'])
  return rootNameOf(value['object'])
}

export const executorNoIoInFilling = defineRule({
  meta,
  create(context: Context) {
    if (!isExecutorFile(context.filename)) return {}

    const workflowNames = new Set<string>()
    const ioNames = new Set<string>()

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const cell = cellOf(node.source.value)
        if (cell === 'workflow') {
          for (const specifier of node.specifiers) workflowNames.add(specifier.local.name)
          return
        }
        if (!IO_CELLS.some((io) => io === cell)) return
        for (const specifier of node.specifiers) ioNames.add(specifier.local.name)
      },
      CallExpression(node: ESTree.CallExpression) {
        const root = calleeRootName(node.callee)
        if (root === null) return
        if (!workflowNames.has(root)) return

        let reported = false
        const report = (actual: string): void => {
          if (reported) return
          reported = true
          context.report({
            node,
            messageId: 'ioInWorkflowArgument',
            data: {
              name: root,
              expected: IO_IN_FILLING_EXPECTED,
              actual,
              fix: IO_IN_FILLING_FIX,
            },
          })
        }

        walk(node.arguments, (inner) => {
          if (SUSPENSION_TYPES.some((suspension) => suspension === nodeType(inner))) {
            report(SUSPENSION_ACTUAL)
            return
          }
          const innerRoot = rootNameOf(inner['callee'])
          if (innerRoot === null) return
          if (!ioNames.has(innerRoot)) return
          report(IO_CALL_ACTUAL)
        })
      },
    }
  },
})
