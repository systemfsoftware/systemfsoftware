import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { isStateMachineFamilySpecifier } from '@systemfsoftware/oxlint-import-origin'

import {
  ATOM_SOURCES,
  FAMILY_IMPORT_EXPECTED,
  FAMILY_IMPORT_FIX,
  FAMILY_REACT_SOURCES,
  familyImportActual,
  familyImportName,
  meta,
  REACT_BINDING_EXPECTED,
  REACT_BINDING_FIX,
  reactBindingActual,
  reactBindingName,
} from './atoms-read-services.config.js'
import { variableOf } from './kernel-boundary.js'
import { literalStringOf } from './module-origin.js'
import { walk } from './module-scope.js'
import { isTestFile } from './test-file.js'

export type Options = []
export type MessageIds = 'atomImportsMachineFamily' | 'machineFamilyReactBinding'

interface MachineEdge {
  readonly node: ESTree.Node
  readonly source: string
}

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

/**
 * Whether an import binds types only — `import type …`, or an all-`type`
 * specifier list. A type-only edge carries no machine: nothing is imported at
 * runtime. A bare side-effect import (`import '<source>'`, no specifiers) is
 * not type-only: the module is still a dependency of this one.
 */
const bindsTypesOnly = (statement: ESTree.ImportDeclaration): boolean =>
  statement.importKind === 'type' ||
  (statement.specifiers.length > 0 &&
    statement.specifiers.every((specifier) => specifier.type === 'ImportSpecifier' && specifier.importKind === 'type'))

/**
 * Whether a named re-export carries types only, so no value can leave through
 * it: a statement-level `export type { … }`, or an all-`type` specifier list.
 * A list with no specifier at all (`export {} from '<source>'`) still makes the
 * source a dependency of this module, so it is not a type-only edge.
 */
const exportsTypesOnly = (statement: ESTree.ExportNamedDeclaration): boolean =>
  statement.exportKind === 'type' ||
  (statement.specifiers.length > 0 &&
    statement.specifiers.every((specifier) => specifier.exportKind === 'type'))

export const atomsReadServices = defineRule({
  meta,
  create(context: Context) {
    if (isTestFile(context.filename)) return {}
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
            if (!bindsTypesOnly(statement)) recordEdges(statement, source)
            continue
          }
          if (statement.type === 'ExportNamedDeclaration' && statement.source !== null) {
            if (!exportsTypesOnly(statement)) recordEdges(statement, statement.source.value)
            continue
          }
          if (statement.type === 'ExportAllDeclaration') {
            if (statement.exportKind !== 'type') recordEdges(statement, statement.source.value)
            continue
          }
          rest.push(statement)
        }

        let readsAtom = false
        for (const statement of rest) {
          walk(statement, (node) => {
            if (node.type === 'ImportExpression') {
              const source = literalStringOf(node.source)
              if (source === null) return
              // A dynamic import of an atom package marks the module as an atom
              // module wherever its bindings are read, exactly as a static one does.
              if (ATOM_SOURCES[source] === true) {
                readsAtom = true
                return
              }
              recordEdges(node, source)
              return
            }
            if (readsAtom || node.type !== 'Identifier' || !atomBindings.has(node.name)) return
            // Only a reference bound to the atom import counts: a nearer binding of
            // the same name (a parameter, a local) is not that import.
            if (!isReference(node)) return
            if (variableOf(node, context.sourceCode.getScope)?.defs[0]?.type === 'ImportBinding') readsAtom = true
          })
        }

        if (readsAtom) {
          for (const edge of familyEdges) {
            context.report({
              node: edge.node,
              messageId: 'atomImportsMachineFamily',
              data: {
                name: familyImportName(edge.source),
                expected: FAMILY_IMPORT_EXPECTED,
                actual: familyImportActual(edge.source),
                fix: FAMILY_IMPORT_FIX,
              },
            })
          }
        }
        for (const edge of reactEdges) {
          context.report({
            node: edge.node,
            messageId: 'machineFamilyReactBinding',
            data: {
              name: reactBindingName(edge.source),
              expected: REACT_BINDING_EXPECTED,
              actual: reactBindingActual(edge.source),
              fix: REACT_BINDING_FIX,
            },
          })
        }
      },
    }
  },
})
