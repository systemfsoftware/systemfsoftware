import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { isStateMachineFamilySpecifier } from '@systemfsoftware/oxlint-import-origin'

import { ATOM_SOURCES, FAMILY_REACT_SOURCES, meta } from './atoms-read-services.config.js'
import { walk } from './module-scope.js'

export type Options = []
export type MessageIds = 'atomImportsMachineFamily' | 'machineFamilyReactBinding'

interface MachineEdge {
  readonly node: ESTree.Node
  readonly source: string
}

const staticStringOf = (node: ESTree.Node): string | null =>
  node.type === 'Literal' && typeof node.value === 'string' ? node.value : null

/**
 * Whether the identifier reads its binding at runtime. A specifier's local, an
 * object key, a member property in a non-computed position and a declarator's
 * own pattern name the binding without reading it; everything else — a call
 * callee, an argument, a member object, an initializer — does.
 */
const isReference = (node: ESTree.Node): boolean => {
  const parent = node.parent
  if (parent === null || parent === undefined) return false
  switch (parent.type) {
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
      return false
    case 'ExportSpecifier':
      return parent.local !== node
    case 'Property':
      return parent.computed || parent.value === node
    case 'MemberExpression':
      return parent.computed || parent.object === node
    case 'VariableDeclarator':
      return parent.init === node
    default:
      return true
  }
}

export const atomsReadServices = defineRule({
  meta,
  create(context: Context) {
    return {
      Program(program: ESTree.Program) {
        const atomBindings = new Set<string>()
        const familyEdges: MachineEdge[] = []
        const reactEdges: MachineEdge[] = []
        const rest: ESTree.Node[] = []

        const recordEdges = (node: ESTree.Node, source: string): void => {
          if (FAMILY_REACT_SOURCES[source] === true) {
            reactEdges.push({ node, source })
            return
          }
          if (isStateMachineFamilySpecifier(source)) familyEdges.push({ node, source })
        }

        for (const statement of program.body) {
          if (statement.type === 'ImportDeclaration') {
            const source = statement.source.value
            if (ATOM_SOURCES[source] === true && statement.importKind !== 'type') {
              for (const specifier of statement.specifiers) {
                if (specifier.type === 'ImportSpecifier' && specifier.importKind === 'type') continue
                atomBindings.add(specifier.local.name)
              }
            }
            recordEdges(statement, source)
            continue
          }
          if (statement.type === 'ExportNamedDeclaration' && statement.source !== null) {
            recordEdges(statement, statement.source.value)
            continue
          }
          if (statement.type === 'ExportAllDeclaration') {
            recordEdges(statement, statement.source.value)
            continue
          }
          rest.push(statement)
        }

        let readsAtom = false
        for (const statement of rest) {
          walk(statement, (node) => {
            if (node.type === 'ImportExpression') {
              const source = staticStringOf(node.source)
              if (source !== null) recordEdges(node, source)
              return
            }
            if (readsAtom || node.type !== 'Identifier' || !atomBindings.has(node.name)) return
            if (isReference(node)) readsAtom = true
          })
        }

        if (readsAtom) {
          for (const edge of familyEdges) {
            context.report({
              node: edge.node,
              messageId: 'atomImportsMachineFamily',
              data: { source: edge.source },
            })
          }
        }
        for (const edge of reactEdges) {
          context.report({
            node: edge.node,
            messageId: 'machineFamilyReactBinding',
            data: { source: edge.source },
          })
        }
      },
    }
  },
})
