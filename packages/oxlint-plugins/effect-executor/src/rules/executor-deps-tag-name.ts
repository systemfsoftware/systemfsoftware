import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { expectedDepsTagName, isExecutorFile } from './cell.js'
import {
  meta,
  MULTIPLE_DEPS_TAGS_FIX,
  PROVIDER_NAMED_TAG_FIX,
  TAG_IDENTIFIER_MISMATCH_FIX,
} from './executor-deps-tag-name.config.js'

export type MessageIds = 'providerNamedTag' | 'tagIdentifierMismatch' | 'multipleDepsTags'

const isContextTagCall = (callee: ESTree.Node): boolean => {
  if (callee.type !== 'MemberExpression') return false
  if (callee.computed) return false
  if (callee.object.type !== 'Identifier') return false
  if (callee.object.name !== 'Context') return false
  if (callee.property.name !== 'Tag') return false
  return true
}

const tagLiteralValue = (
  inner: ESTree.CallExpression,
): { literal: string } | null => {
  const first = inner.arguments[0]
  if (first === undefined) return null
  if (first.type !== 'Literal') return null
  if (typeof first.value !== 'string') return null
  return { literal: first.value }
}

export const executorDepsTagName = defineRule({
  meta,
  create(context: Context) {
    if (!isExecutorFile(context.filename)) return {}

    const depTags: { node: ESTree.Class; className: string }[] = []

    return {
      ClassDeclaration(node: ESTree.Class) {
        if (node.id === null) return
        if (node.superClass === null) return
        if (node.superClass.type !== 'CallExpression') return
        if (node.superClass.callee.type !== 'CallExpression') return
        if (!isContextTagCall(node.superClass.callee.callee)) return

        const className = node.id.name
        const expected = expectedDepsTagName(context.filename)

        if (className !== expected) {
          context.report({
            node,
            messageId: 'providerNamedTag',
            data: {
              name: className,
              expected: `the consumer-owned Tag ${expected}`,
              actual: `a Tag named ${className}`,
              fix: PROVIDER_NAMED_TAG_FIX,
            },
          })
        }

        // `deterministicKeys` (@effect/tsgo) requires the identifier to be the package-and-path
        // qualified key, which ends in the class name. Both spellings name this class; a bare
        // identifier that is neither does not.
        const literal = tagLiteralValue(node.superClass.callee)
        if (
          literal !== null && literal.literal !== className && !literal.literal.endsWith(`/${className}`)
        ) {
          context.report({
            node,
            messageId: 'tagIdentifierMismatch',
            data: {
              name: literal.literal,
              expected:
                `the identifier to equal the class name ${className}, or a deterministic key ending in /${className}`,
              actual: `identifier '${literal.literal}' on class ${className}`,
              fix: TAG_IDENTIFIER_MISMATCH_FIX,
            },
          })
        }

        depTags.push({ node, className })
      },
      'Program:exit'() {
        const count = depTags.length
        for (const [index, entry] of depTags.entries()) {
          if (index === 0) continue
          context.report({
            node: entry.node,
            messageId: 'multipleDepsTags',
            data: {
              name: entry.className,
              expected: 'exactly one <Executor>Deps Tag per executor',
              actual: `${count} dependency Tags in one executor`,
              fix: MULTIPLE_DEPS_TAGS_FIX,
            },
          })
        }
      },
    }
  },
})
