import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import {
  actualOf,
  DECLARATION_FORM,
  DEFAULT_FORM,
  EXPECTED,
  FIX,
  meta,
  SPECIFIER_FORM,
} from './handle-definition-stays-private.config.js'
import { isHandleFile } from './kind-file.js'
import { kindOfConstruction, type ModuleOrigins, moduleOriginsOf } from './module-origin.js'
import {
  defaultExportNameOf,
  exportSpecifierNamesOf,
  type ModuleDeclaration,
  moduleDeclarationsOf,
} from './module-scope.js'

export type MessageIds = 'exportedDefinition'

const definitionNameOf = (declaration: ModuleDeclaration, origins: ModuleOrigins): string | null => {
  if (declaration.name === null) return null
  if (declaration.declarator.init === null) return null
  if (kindOfConstruction(declaration.declarator.init, origins) !== 'handle') return null
  return declaration.name
}

export const handleDefinitionStaysPrivate = defineRule({
  meta,
  create(context: Context) {
    if (!isHandleFile(context.filename)) return {}
    const program = context.sourceCode.ast
    const origins = moduleOriginsOf(program)
    const specifierNames = exportSpecifierNamesOf(program)
    const defaultName = defaultExportNameOf(program)

    const report = (node: ESTree.Node, name: string, form: string): void => {
      context.report({
        node,
        messageId: 'exportedDefinition',
        data: {
          name: `the handle definition binding \`${name}\``,
          expected: EXPECTED,
          actual: actualOf(name, form),
          fix: FIX,
        },
      })
    }

    return {
      'Program:exit'(node: ESTree.Program) {
        for (const declaration of moduleDeclarationsOf(node)) {
          const name = definitionNameOf(declaration, origins)
          if (name === null) continue
          if (declaration.exported) {
            report(declaration.declarator, name, DECLARATION_FORM)
            continue
          }
          if (specifierNames.has(name)) {
            report(declaration.declarator, name, SPECIFIER_FORM)
            continue
          }
          if (defaultName === name) {
            report(declaration.declarator, name, DEFAULT_FORM)
          }
        }
      },
    }
  },
})
