import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  BANNED_SOURCE,
  CORRECT_SOURCE,
  meta,
  REPORT_EXPECTED_PREFIX,
  REPORT_FIX_PREFIX,
  SCHEMA_ALIAS,
} from './ban-@-effect-schema-imports.config.js'

export type Options = []
export type MessageIds = 'bannedImport'

export const banEffectSchemaImports = defineRule({
  meta,
  create(context: Context) {
    const reportViolation = (
      node: ESTree.Node,
      actual: string,
      fix: () => { range: [number, number]; text: string }[],
    ) => {
      context.report({
        node,
        messageId: 'bannedImport',
        data: {
          expected: REPORT_EXPECTED_PREFIX,
          actual: `'${actual}'`,
          fix: REPORT_FIX_PREFIX,
        },
        fix,
      })
    }

    const isBannedSource = (source: string): boolean => {
      return source === BANNED_SOURCE || source.startsWith(`${BANNED_SOURCE}/`)
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const sourceValue = node.source.value

        if (!isBannedSource(sourceValue)) {
          return
        }

        const schemaSpecifier = node.specifiers.find(
          (s): s is ESTree.ImportSpecifier =>
            s.type === 'ImportSpecifier' &&
            s.imported.type === 'Identifier' &&
            s.imported.name === 'Schema',
        )

        const fix = (): { range: [number, number]; text: string }[] => {
          if (!schemaSpecifier || !schemaSpecifier.range) {
            return [{ range: node.source.range, text: `'${CORRECT_SOURCE}'` }]
          }

          return [
            { range: schemaSpecifier.range, text: SCHEMA_ALIAS },
            { range: node.source.range, text: `'${CORRECT_SOURCE}'` },
          ]
        }

        const reportNode = schemaSpecifier?.local ?? node.source
        reportViolation(reportNode, sourceValue, fix)
      },
    }
  },
})
