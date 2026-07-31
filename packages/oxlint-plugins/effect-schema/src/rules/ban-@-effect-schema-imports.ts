// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

export type Options = []
export type MessageIds = 'bannedImport'

export const banEffectSchemaImports = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Ban imports from deprecated @effect/schema package - use Schema from effect instead',
    },
    fixable: 'code',
    schema: [],
    messages: {
      bannedImport: 'Import from {{actual}} is forbidden. ' +
        'Expected: {{expected}}. ' +
        'Actual: {{actual}}. ' +
        'Fix: {{fix}}.',
    },
  },
  create(context: Context) {
    // Stryker restore all
    const BANNED_SOURCE = '@effect/schema'
    const CORRECT_SOURCE = 'effect'
    const SCHEMA_ALIAS = 'Schema as S'

    const reportViolation = (
      node: ESTree.Node,
      actual: string,
      fix: () => { range: [number, number]; text: string }[],
    ) => {
      context.report({
        node,
        messageId: 'bannedImport',
        data: {
          expected: `'${CORRECT_SOURCE}' with ${SCHEMA_ALIAS}`,
          actual: `'${actual}'`,
          fix: `Replace import source with '${CORRECT_SOURCE}' and add 'as S' alias`,
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
