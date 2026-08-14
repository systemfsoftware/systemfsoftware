import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { cellOf, isExecutorFile } from './cell.js'
import {
  DESCRIPTION_NAMESPACE,
  DESCRIPTION_SOURCE,
  IO_CALL_ACTUAL,
  IO_CELLS,
  IO_IN_PURE_PHASE_EXPECTED,
  IO_IN_PURE_PHASE_FIX,
  IO_SOURCES,
  meta,
  PURE_PHASES,
  SKIPPED_WALK_KEYS,
} from './executor-no-io-in-filling.config.js'

export type MessageIds = 'ioInPurePhase'

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

const isCallExpression = (value: Walkable): value is Walkable & ESTree.CallExpression =>
  nodeType(value) === 'CallExpression'

/**
 * The phase a call targets, or null when the callee is not a pure phase
 * constructor. Classification rides the import edge (EE1): the object must be
 * a local binding of the description package, never a name that merely spells
 * like one. `read` and `write` are deliberately absent from PURE_PHASES —
 * their bodies are impure, and I/O there is their job.
 */
const purePhaseNameOf = (callee: ESTree.Node, namespaces: ReadonlySet<string>): string | null => {
  if (callee.type !== 'MemberExpression') return null
  const object = callee.object
  if (object.type !== 'Identifier') return null
  if (!namespaces.has(object.name)) return null
  const property = callee.property
  const propertyName = property.type === 'Identifier' ? property.name : null
  return PURE_PHASES.some((phase) => phase === propertyName) ? propertyName : null
}

export const executorNoIoInFilling = defineRule({
  meta,
  create(context: Context) {
    if (!isExecutorFile(context.filename)) return {}

    const descriptionNamespaces = new Set<string>()
    const ioNames = new Set<string>()

    const reportIoInBody = (body: unknown): void => {
      walk(body, (inner) => {
        if (!isCallExpression(inner)) return
        const innerRoot = rootNameOf(inner['callee'])
        if (innerRoot === null) return
        if (!ioNames.has(innerRoot)) return
        context.report({
          node: inner,
          messageId: 'ioInPurePhase',
          data: {
            name: innerRoot,
            expected: IO_IN_PURE_PHASE_EXPECTED,
            actual: IO_CALL_ACTUAL,
            fix: IO_IN_PURE_PHASE_FIX,
          },
        })
      })
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = node.source.value
        if (source === DESCRIPTION_SOURCE) {
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
          return
        }
        if (IO_SOURCES.some((ioSource) => ioSource === source)) {
          for (const specifier of node.specifiers) ioNames.add(specifier.local.name)
          return
        }
        const cell = cellOf(source)
        if (!IO_CELLS.some((io) => io === cell)) return
        for (const specifier of node.specifiers) ioNames.add(specifier.local.name)
      },
      CallExpression(node: ESTree.CallExpression) {
        if (purePhaseNameOf(node.callee, descriptionNamespaces) === null) return
        for (const argument of node.arguments) {
          if (argument.type === 'ArrowFunctionExpression' || argument.type === 'FunctionExpression') {
            reportIoInBody(argument)
          }
        }
      },
    }
  },
})
