import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Schema as S } from 'effect'
import { DOMAIN_CELL_SUFFIXES, meta, Options } from './policy-no-domain-imports.config.js'

export type MessageIds = 'domainCellImport'

const isPolicyFile = (filename: string): boolean => filename.endsWith('.policy.ts')

const PathSegments = S.NonEmptyArray(S.String)

const lastSegmentOf = (source: string): string => {
  const segments = S.decodeUnknownSync(PathSegments)(source.split('/'))
  return A.lastNonEmpty(segments)
}

const DOMAIN_CELL_SUFFIX_NAMES = DOMAIN_CELL_SUFFIXES.map((suffix) => suffix.slice(1))

const DOMAIN_CELL_REGEX = new RegExp(
  `\\.(${DOMAIN_CELL_SUFFIX_NAMES.join('|')})(\\.js|\\.ts)?$`,
)

const domainCellSuffix = (source: string): string | null => {
  const match = DOMAIN_CELL_REGEX.exec(lastSegmentOf(source))
  if (match === null) return null
  return `.${match[1]}`
}

export const policyNoDomainImports = defineRule({
  meta,
  create(context: Context) {
    if (!isPolicyFile(context.filename)) return {}

    const reportSource = (node: ESTree.Node, source: string): void => {
      const suffix = domainCellSuffix(source)
      if (suffix === null) return
      context.report({
        node,
        messageId: 'domainCellImport',
        data: {
          name: source,
          expected: 'imports of pure value modules, sibling .policy combinators, and the effect library only',
          actual: `an import of the ${suffix} cell`,
          fix: 'a policy is domain-blind — pass the value in as an argument, or compose the sibling policy',
        },
      })
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        reportSource(node, node.source.value)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        reportSource(node, node.source.value)
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (!node.source) return
        reportSource(node, node.source.value)
      },
      ImportExpression(node: ESTree.ImportExpression) {
        if (node.source.type !== 'Literal' || typeof node.source.value !== 'string') return
        reportSource(node, node.source.value)
      },
    }
  },
})
