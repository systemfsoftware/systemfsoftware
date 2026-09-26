import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { SCHEMA_FILE_SUFFIX } from './schema-declaration-location.config.js'
import { basenameOf } from './schema-declaration-location.js'
import {
  EFFECT_ROOT_ACTUAL,
  EFFECT_ROOT_ALLOWED_NAMES,
  isAllowedImportSource,
  meta,
  PURE_IMPORT_ACTUAL,
  PURE_IMPORT_EXPECTED,
  PURE_IMPORT_FIX,
} from './schema-file-imports-pure-modules-only.config.js'

export type MessageIds = 'nonPureImport'

const specifierIsTypeOnly = (specifier: ESTree.Node): boolean =>
  ('importKind' in specifier && specifier.importKind === 'type') ||
  ('exportKind' in specifier && specifier.exportKind === 'type')

const allSpecifiersTypeOnly = (specifiers: readonly ESTree.Node[]): boolean =>
  specifiers.length > 0 && specifiers.every(specifierIsTypeOnly)

const importedNameOf = (specifier: ESTree.ImportSpecifier): string =>
  specifier.imported.type === 'Identifier' ? specifier.imported.name : String(specifier.imported.value)

/**
 * KTD5's rule: a `*.schema.ts` file may import only the pure modules R6 names.
 * A bare `effect` import is judged by name — every non-type specifier must be a
 * pure root name, a schema-family name, or `Effect` — because one specifier
 * carries the pure and the I/O names alike.
 */
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

    const reportEffectRoot = (node: ESTree.ImportDeclaration): void => {
      const impure: string[] = []
      for (const specifier of node.specifiers) {
        if (specifierIsTypeOnly(specifier)) continue
        if (specifier.type === 'ImportSpecifier') {
          const name = importedNameOf(specifier)
          if (!EFFECT_ROOT_ALLOWED_NAMES.has(name)) impure.push(name)
          continue
        }
        impure.push(specifier.local.name)
      }
      if (impure.length === 0) return
      report(node, 'a value import', EFFECT_ROOT_ACTUAL.replace('{{names}}', impure.join(', ')))
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (node.importKind === 'type' || allSpecifiersTypeOnly(node.specifiers)) return
        const source = node.source.value
        if (source === 'effect') {
          reportEffectRoot(node)
          return
        }
        reportSource(node, 'a value import', source)
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
