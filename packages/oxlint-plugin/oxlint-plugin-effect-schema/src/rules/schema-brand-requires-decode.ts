import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { originMemberSequence, resolveImportOrigin } from '@systemfsoftware/oxlint-import-origin'
import { BRAND_ACTUAL, BRAND_EXPECTED, BRAND_FIX, meta } from './schema-brand-requires-decode.config.js'

export type MessageIds = 'zeroDecodeBrand'

type GetScope = (node: ESTree.Node) => unknown

const BRAND_SOURCES: Readonly<Record<string, true>> = {
  effect: true,
  'effect/Brand': true,
}

const NOMINAL_NAME = 'Brand.nominal (a zero-validation cast)' as const

const MEMBER_CHECK_NAME = 'Brand.check() with no checks' as const

const BARE_CHECK_NAME = 'check() with no checks' as const

const isBrandSource = (source: string): boolean => BRAND_SOURCES[source] === true

const sequenceOf = (
  node: ESTree.Node,
  getScope: GetScope,
): { readonly source: string; readonly sequence: readonly string[] } | null => {
  const origin = resolveImportOrigin(node, getScope)
  if (origin === null || !isBrandSource(origin.source)) return null
  return { source: origin.source, sequence: originMemberSequence(origin) }
}

const isNominalSequence = (source: string, sequence: readonly string[]): boolean => {
  if (sequence.length === 2 && sequence[0] === 'Brand' && sequence[1] === 'nominal') return true
  return source === 'effect/Brand' && sequence.length === 1 && sequence[0] === 'nominal'
}

const isCheckSequence = (source: string, sequence: readonly string[]): boolean => {
  if (sequence.length === 2 && sequence[0] === 'Brand' && sequence[1] === 'check') return true
  return source === 'effect/Brand' && sequence.length === 1 && sequence[0] === 'check'
}

export const schemaBrandRequiresDecode = defineRule({
  meta,
  create(context: Context) {
    const getScope: GetScope = context.sourceCode.getScope
    return {
      CallExpression(node: ESTree.CallExpression) {
        const { callee } = node
        if (callee.type === 'MemberExpression') {
          const resolved = sequenceOf(callee, getScope)
          if (resolved === null) return
          if (isNominalSequence(resolved.source, resolved.sequence)) {
            context.report({
              node,
              messageId: 'zeroDecodeBrand',
              data: { name: NOMINAL_NAME, expected: BRAND_EXPECTED, actual: BRAND_ACTUAL, fix: BRAND_FIX },
            })
            return
          }
          if (node.arguments.length === 0 && isCheckSequence(resolved.source, resolved.sequence)) {
            context.report({
              node,
              messageId: 'zeroDecodeBrand',
              data: { name: MEMBER_CHECK_NAME, expected: BRAND_EXPECTED, actual: BRAND_ACTUAL, fix: BRAND_FIX },
            })
          }
          return
        }
        if (callee.type === 'Identifier') {
          if (node.arguments.length !== 0) return
          const resolved = sequenceOf(callee, getScope)
          if (resolved === null || !isCheckSequence(resolved.source, resolved.sequence)) return
          context.report({
            node,
            messageId: 'zeroDecodeBrand',
            data: { name: BARE_CHECK_NAME, expected: BRAND_EXPECTED, actual: BRAND_ACTUAL, fix: BRAND_FIX },
          })
        }
      },
    }
  },
})
