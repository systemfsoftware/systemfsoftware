// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { JSONSchema, Schema as S } from 'effect'

const Options = S.Struct({
  severity: S.optionalWith(
    S.Literal('error', 'warn', 'off'),
    { default: () => 'error' },
  ),
  excludeRoot: S.optionalWith(
    S.Boolean,
    { default: () => true },
  ),
})

export type MessageIds =
  | 'barrelFile'
  | 'reExportAll'
  | 'reExportNamed'
  | 'barrelImport'

const BARREL_BASENAMES = new Set(['index.ts', 'index.tsx', 'mod.ts', 'mod.tsx'])

const BARREL_LAST_PARTS = new Set([
  'index',
  'index.js',
  'index.jsx',
  'index.ts',
  'index.tsx',
  'mod',
  'mod.js',
  'mod.jsx',
  'mod.ts',
  'mod.tsx',
])

export const noBarrels = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Detect barrel files (index.ts/mod.ts with re-exports) and barrel imports',
    },
    hasSuggestions: false,
    schema: [JSONSchema.make(Options)],
    messages: {
      barrelFile:
        'Barrel file detected. Expected: Direct imports from specific modules. Actual: Re-exporting from multiple modules. Fix: Import directly from specific modules.',
      reExportAll:
        '{{source}} is forbidden. Expected: Direct import from specific module. Actual: `export * from "{{source}}"`. Fix: Import directly from specific modules.',
      reExportNamed:
        '{{source}} is forbidden. Expected: Direct import from specific module. Actual: `export {{specifiers}} from "{{source}}"`. Fix: Import directly from specific modules.',
      barrelImport:
        '{{path}} is forbidden. Expected: Direct module path. Actual: Barrel import from "{{path}}". Fix: Import directly from the specific module.',
    },
  },
  create(context: Context) {
    // Stryker restore all
    const parsed = S.decodeUnknownSync(S.Array(Options))(context.options)
    const options = parsed[0] ?? S.decodeUnknownSync(Options)({})
    const severity = options.severity
    const excludeRoot = options.excludeRoot

    if (severity === 'off') {
      return {}
    }

    const filename = context.filename

    const checkBarrelFile = (): boolean => {
      const basename = filename.slice(filename.lastIndexOf('/') + 1)
      if (!BARREL_BASENAMES.has(basename)) return false
      if (!excludeRoot) return true
      const dirParts = filename.split('/').slice(0, -1)
      const srcIndex = dirParts.lastIndexOf('src')
      if (srcIndex === dirParts.length - 1) return false
      return true
    }

    const isBarrelFile = checkBarrelFile()

    const formatSpecifier = (s: ESTree.ExportSpecifier): string => {
      const localName = s.local.type === 'Identifier' ? s.local.name : String(s.local.value)
      const exported = s.exported
      const exportedName = exported.type === 'Identifier' ? exported.name : String(exported.value)
      return localName === exportedName ? localName : `${localName} as ${exportedName}`
    }

    const isBarrelImport = (importPath: string): boolean => {
      const firstChar = importPath[0]
      if (firstChar !== '.' && firstChar !== '/') {
        return false
      }

      const parts = importPath.split('/')
      const lastPart = parts[parts.length - 1]

      return lastPart !== undefined && BARREL_LAST_PARTS.has(lastPart)
    }

    return {
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        if (isBarrelFile) {
          context.report({
            node,
            messageId: 'reExportAll',
            data: { source: node.source.value },
          })
        }
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (!isBarrelFile || !node.source) {
          return
        }

        context.report({
          node,
          messageId: 'reExportNamed',
          data: {
            source: node.source.value,
            specifiers: node.specifiers.map(formatSpecifier).join(', '),
          },
        })
      },
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (isBarrelImport(node.source.value)) {
          context.report({
            node,
            messageId: 'barrelImport',
            data: { path: node.source.value },
          })
        }
      },
      ImportExpression(node: ESTree.ImportExpression) {
        if (node.source.type !== 'Literal' || typeof node.source.value !== 'string') return
        if (isBarrelImport(node.source.value)) {
          context.report({
            node,
            messageId: 'barrelImport',
            data: { path: node.source.value },
          })
        }
      },
    }
  },
})
