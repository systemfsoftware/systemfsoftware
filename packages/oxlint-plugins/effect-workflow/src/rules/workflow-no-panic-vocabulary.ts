import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Option } from 'effect'
import { GENERIC_SUFFIXES, meta, PANIC_PREFIXES } from './workflow-no-panic-vocabulary.config.js'

export type MessageIds = 'panicVocabulary'

const isWorkflowFile = (filename: string): boolean => filename.endsWith('.workflow.ts')

const isTaggedErrorCall = (node: ESTree.CallExpression): boolean => {
  if (node.callee.type !== 'CallExpression') return false
  const inner = node.callee
  if (inner.callee.type !== 'MemberExpression') return false
  const callee = inner.callee
  if (callee.object.type !== 'Identifier' || callee.object.name !== 'S') return false
  if (callee.property.type !== 'Identifier') return false
  return callee.property.name === 'TaggedError'
}

const panicTokenOf = (name: string): string | undefined =>
  A.findFirst(
    PANIC_PREFIXES,
    (prefix) =>
      name.startsWith(prefix) &&
      A.some(GENERIC_SUFFIXES, (suffix) => suffix === name.slice(prefix.length)),
  ).pipe(Option.getOrUndefined)

export const workflowNoPanicVocabulary = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!isWorkflowFile(filename)) return {}

    return {
      ClassDeclaration(node: ESTree.Class) {
        if (!node.id) return
        if (!node.superClass) return
        if (node.superClass.type !== 'CallExpression') return
        if (!isTaggedErrorCall(node.superClass)) return

        const token = panicTokenOf(node.id.name)
        if (token !== undefined) {
          context.report({
            node,
            messageId: 'panicVocabulary',
            data: {
              name: node.id.name,
              expected: 'error variants named for expected domain failures a consumer can handle',
              actual:
                `${node.id.name} is pure panic vocabulary (${token}) — panics are defects at the shell edge, not typed errors in a workflow`,
              fix: 'rename it for the domain failure, or delete it and let the invariant surface as a defect',
            },
          })
        }
      },
    }
  },
})
