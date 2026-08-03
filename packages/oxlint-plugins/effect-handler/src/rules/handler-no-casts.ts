import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta, Options } from './handler-no-casts.config.js'

export type MessageIds = 'asAssertion' | 'angleBracketAssertion'

const isHandlerFile = (filename: string): boolean => filename.endsWith('.handler.ts')

const isConstAssertion = (node: ESTree.TSAsExpression): boolean => {
  // oxc parses `as const` as a TSTypeReference to the identifier `const`,
  // not as a TSLiteralType over a string literal.
  const annotation = node.typeAnnotation
  if (annotation.type !== 'TSTypeReference') return false
  const typeName = annotation.typeName
  if (typeName.type !== 'Identifier') return false
  return typeName.name === 'const'
}

export const handlerNoCasts = defineRule({
  meta,
  create(context: Context) {
    if (!isHandlerFile(context.filename)) return {}

    return {
      TSAsExpression(node: ESTree.TSAsExpression) {
        if (isConstAssertion(node)) return
        context.report({
          node,
          messageId: 'asAssertion',
          data: {
            name: 'as',
            expected: 'a Schema codec decode (HttpServerRequest.schemaBodyJson, S.decodeUnknownSync, ...)',
            actual: 'an as type assertion on transport data',
            fix:
              'decode the request through a Schema codec so malformed or malicious payloads are rejected at the boundary',
          },
        })
      },

      TSTypeAssertion(node: ESTree.TSTypeAssertion) {
        context.report({
          node,
          messageId: 'angleBracketAssertion',
          data: {
            name: 'type assertion',
            expected: 'a Schema codec decode (HttpServerRequest.schemaBodyJson, S.decodeUnknownSync, ...)',
            actual: 'an angle-bracket <T> type assertion',
            fix:
              'decode the request through a Schema codec so malformed or malicious payloads are rejected at the boundary',
          },
        })
      },
    }
  },
})
