import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { cellOf, isStoreFile, lastSegmentOf } from './cell.js'
import { ACL_EXPECTED, ACL_FIX, meta } from './store-acl-required.config.js'

export type MessageIds = 'missingAclImport'

const isValueImport = (node: ESTree.ImportDeclaration): boolean => {
  if (node.importKind === 'type') return false
  if (node.specifiers.length === 0) return true
  return !node.specifiers.every(
    (specifier) => specifier.type === 'ImportSpecifier' && specifier.importKind === 'type',
  )
}

export const storeAclRequired = defineRule({
  meta,
  create(context: Context) {
    if (!isStoreFile(context.filename)) return {}

    let importsAcl = false

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (cellOf(node.source.value) !== 'acl') return
        if (!isValueImport(node)) return
        importsAcl = true
      },
      'Program:exit'(node: ESTree.Program) {
        if (importsAcl) return
        const reportNode = node.body[0] ?? node
        context.report({
          node: reportNode,
          messageId: 'missingAclImport',
          data: {
            name: lastSegmentOf(context.filename),
            expected: ACL_EXPECTED,
            actual: 'no value import from the aggregate *.acl.ts',
            fix: ACL_FIX,
          },
        })
      },
    }
  },
})
