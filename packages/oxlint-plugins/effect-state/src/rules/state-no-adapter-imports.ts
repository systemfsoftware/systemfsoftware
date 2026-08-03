import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Schema as S } from 'effect'
import { ADAPTER_CELL_REGEX, meta } from './state-no-adapter-imports.config.js'

export type MessageIds = 'adapterCellImport'

const ADAPTER_CELL_IMPORT_MESSAGE_ID: MessageIds = 'adapterCellImport'

const isStateFile = (filename: string): boolean => filename.endsWith('.state.ts')

const PathSegments = S.NonEmptyArray(S.String)

const lastSegmentOf = (source: string): string => {
  const segments = S.decodeUnknownSync(PathSegments)(source.split('/'))
  return A.lastNonEmpty(segments)
}

const hasValueImport = (node: ESTree.ImportDeclaration): boolean => {
  if (node.importKind === 'type') return false
  const specifiers = node.specifiers
  if (specifiers.length === 0) return true
  return specifiers.some((specifier) => specifier.type !== 'ImportSpecifier' || specifier.importKind !== 'type')
}

export const stateNoAdapterImports = defineRule({
  meta,
  create(context: Context) {
    if (!isStateFile(context.filename)) return {}

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (!hasValueImport(node)) return
        const source = node.source.value
        if (!ADAPTER_CELL_REGEX.test(lastSegmentOf(source))) return
        context.report({
          node,
          messageId: ADAPTER_CELL_IMPORT_MESSAGE_ID,
          data: {
            name: source,
            expected: 'imports of coordination primitives and domain types only',
            actual: 'a value import of an adapter cell (the adapter owns the driver)',
            fix: 'keep the driver inside the *.adapter.ts cell — the state cell owns coordination, not connections',
          },
        })
      },
    }
  },
})
