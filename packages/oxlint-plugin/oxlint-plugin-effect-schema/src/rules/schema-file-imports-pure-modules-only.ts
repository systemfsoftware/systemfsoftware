import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { isEffectBarrel, isStateMachineFamilySpecifier } from '@systemfsoftware/oxlint-import-origin'
import { SCHEMA_FILE_SUFFIX } from './schema-declaration-location.config.js'
import { basenameOf } from './schema-declaration-location.js'
import {
  BARREL_ACTUAL,
  isAllowedEffectModule,
  isAllowedImportSource,
  meta,
  PURE_IMPORT_ACTUAL,
  PURE_IMPORT_EXPECTED,
  PURE_IMPORT_FIX,
} from './schema-file-imports-pure-modules-only.config.js'
import { isImportMetaVitestTest, isInsideConsequent } from './vitest-guard.js'

export type MessageIds = 'nonPureImport'

const specifierIsTypeOnly = (specifier: ESTree.Node): boolean =>
  ('importKind' in specifier && specifier.importKind === 'type') ||
  ('exportKind' in specifier && specifier.exportKind === 'type')

const allSpecifiersTypeOnly = (specifiers: readonly ESTree.Node[]): boolean =>
  specifiers.length > 0 && specifiers.every(specifierIsTypeOnly)

const importedNameOf = (specifier: ESTree.ImportSpecifier): string =>
  specifier.imported.type === 'Identifier' ? specifier.imported.name : String(specifier.imported.value)

export const schemaFileImportsPureModulesOnly = defineRule({
  meta,
  create(context: Context) {
    const basename = basenameOf(context.filename)
    if (!basename.endsWith(SCHEMA_FILE_SUFFIX)) return {}

    const report = (node: ESTree.Node, name: string, actual: string): void => {
      context.report({
        node,
        messageId: 'nonPureImport',
        data: { name, expected: PURE_IMPORT_EXPECTED, actual, fix: PURE_IMPORT_FIX },
      })
    }

    const reportSource = (node: ESTree.Node, name: string, source: string): void => {
      if (isAllowedImportSource(source)) return
      report(node, name, PURE_IMPORT_ACTUAL.replace('{{source}}', source))
    }

    const reportEffectBarrel = (node: ESTree.ImportDeclaration, source: string): void => {
      const impure: string[] = []
      for (const specifier of node.specifiers) {
        if (specifierIsTypeOnly(specifier)) continue
        if (specifier.type === 'ImportSpecifier') {
          const name = importedNameOf(specifier)
          if (!isAllowedEffectModule(source, name)) impure.push(name)
          continue
        }
        impure.push(specifier.local.name)
      }
      if (impure.length === 0) return
      report(
        node,
        'a value import',
        BARREL_ACTUAL.replace('{{source}}', source).replace('{{names}}', impure.join(', ')),
      )
    }

    const guards: ESTree.IfStatement[] = []
    const insideVitestGuard = (node: ESTree.Node): boolean =>
      guards.some((guard) => isInsideConsequent(node, guard.consequent))

    /**
     * The vitest guard exempts a dynamic call, except one whose string-literal
     * source names a state-machine family module: the family is refused in every
     * value form, test-only or not.
     */
    const guardExempts = (node: ESTree.Node, source: string | undefined): boolean =>
      insideVitestGuard(node) && !(source !== undefined && isStateMachineFamilySpecifier(source))

    return {
      IfStatement(node: ESTree.IfStatement) {
        if (isImportMetaVitestTest(node.test)) guards.push(node)
      },
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (node.importKind === 'type' || allSpecifiersTypeOnly(node.specifiers)) return
        const source = node.source.value
        if (isEffectBarrel(source)) {
          reportEffectBarrel(node, source)
          return
        }
        reportSource(node, 'a value import', source)
      },
      ImportExpression(node: ESTree.ImportExpression) {
        const source = node.source.type === 'Literal' && typeof node.source.value === 'string'
          ? node.source.value
          : undefined
        if (guardExempts(node, source)) return
        if (source !== undefined) {
          reportSource(node, 'a dynamic import', source)
          return
        }
        report(node, 'a dynamic import', PURE_IMPORT_ACTUAL.replace('{{source}}', '<dynamic>'))
      },
      CallExpression(node: ESTree.CallExpression) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'require') return
        const [argument] = node.arguments
        const source = argument !== undefined && argument.type === 'Literal' && typeof argument.value === 'string'
          ? argument.value
          : undefined
        if (guardExempts(node, source)) return
        if (source !== undefined) {
          reportSource(node, 'a require call', source)
          return
        }
        report(node, 'a require call', PURE_IMPORT_ACTUAL.replace('{{source}}', '<dynamic>'))
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.source === null) return
        if (node.exportKind === 'type' || allSpecifiersTypeOnly(node.specifiers)) return
        reportSource(node, 'a re-export', node.source.value)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        if (node.exportKind === 'type') return
        reportSource(node, 'a re-export', node.source.value)
      },
    }
  },
})
