import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Schema as S } from 'effect'
import { FORBIDDEN_CELL_SUFFIXES, meta, Options } from './adapter-no-domain-cell-imports.config.js'

export type MessageIds = 'domainCellImport'

const isAdapterFile = (filename: string): boolean => filename.endsWith('.adapter.ts')

const PathSegments = S.NonEmptyArray(S.String)

const lastSegmentOf = (source: string): string => {
  const segments = S.decodeUnknownSync(PathSegments)(source.split('/'))
  return A.lastNonEmpty(segments)
}

const FORBIDDEN_CELL_SUFFIX_NAMES = FORBIDDEN_CELL_SUFFIXES.map((suffix) => suffix.slice(1))

const FORBIDDEN_CELL_REGEX = new RegExp(`\\.(${FORBIDDEN_CELL_SUFFIX_NAMES.join('|')})(\\.js|\\.ts)?$`)

const forbiddenCellSuffix = (source: string): string | null => {
  const match = FORBIDDEN_CELL_REGEX.exec(lastSegmentOf(source))
  if (match === null) return null
  return `.${match[1]}`
}

export const adapterNoDomainCellImports = defineRule({
  meta,
  create(context: Context) {
    if (!isAdapterFile(context.filename)) return {}

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = node.source.value
        const suffix = forbiddenCellSuffix(source)
        if (suffix === null) return
        context.report({
          node,
          messageId: 'domainCellImport',
          data: {
            name: source,
            expected:
              'imports of only the port (executor), the domain error type (schema), the foreign shape, and the one foreign package',
            actual: `an import of the ${suffix} cell`,
            fix:
              'the adapter is a translation seam — pass domain values through the port or move this import to the composition root',
          },
        })
      },
    }
  },
})
