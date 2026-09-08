import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import { ACTUAL, EXPECTED, FIX, meta, OPTIONS_TYPE_SUFFIXES } from './no-mutable-options-field.config.js'

export type Options = []
export type MessageIds = 'mutableOptionsField'

const isOptionsTypeName = (name: string): boolean => {
  for (const suffix of OPTIONS_TYPE_SUFFIXES) {
    if (name.endsWith(suffix)) {
      return true
    }
  }
  return false
}

const memberNameOf = (member: ESTree.TSPropertySignature): string | null => {
  const key = member.key
  if (key.type === 'Identifier') {
    return key.name
  }
  if (key.type === 'Literal' && typeof key.value === 'string') {
    return key.value
  }
  return null
}

const reportMutableMembers = (
  context: Context,
  typeName: string,
  members: readonly ESTree.TSSignature[],
): void => {
  for (const member of members) {
    if (member.type !== 'TSPropertySignature') {
      continue
    }
    if (member.readonly) {
      continue
    }
    const field = memberNameOf(member) ?? '<computed>'
    context.report({
      node: member,
      messageId: 'mutableOptionsField',
      data: {
        name: `'${typeName}.${field}'`,
        expected: EXPECTED,
        actual: ACTUAL,
        fix: FIX,
      },
    })
  }
}

export const noMutableOptionsField = defineRule({
  meta,
  create(context: Context) {
    if (context.filename.endsWith('.d.ts')) return {}
    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const declaration = node.declaration
        if (declaration == null) {
          return
        }
        if (declaration.type === 'TSInterfaceDeclaration') {
          if (!isOptionsTypeName(declaration.id.name)) {
            return
          }
          reportMutableMembers(context, declaration.id.name, declaration.body.body)
          return
        }
        if (declaration.type !== 'TSTypeAliasDeclaration') {
          return
        }
        if (!isOptionsTypeName(declaration.id.name)) {
          return
        }
        const annotation = declaration.typeAnnotation
        if (annotation.type !== 'TSTypeLiteral') {
          return
        }
        reportMutableMembers(context, declaration.id.name, annotation.members)
      },
    }
  },
})
