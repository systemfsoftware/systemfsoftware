import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  ACTUAL_TXT,
  ANONYMOUS_NAME,
  EXPECTED_TAGGED_ERROR,
  EXPECTED_TAGGED_STRUCT,
  FIX,
  meta,
  NAME_SUFFIX,
  TAG_NAME,
} from './no-manual-tag-member.config.js'

export type MessageIds = 'forbidden'

const isTagKey = (key: ESTree.Node): boolean => {
  if (key.type === 'Identifier') return key.name === TAG_NAME
  if (key.type === 'Literal') return key.value === TAG_NAME
  return false
}

/**
 * The name a sibling member denotes, or `null` when the sibling is not a
 * named member (index signature, call/construct signature). Only property and
 * method signatures carry a key.
 */
const memberNameOf = (member: ESTree.TSSignature): string | null => {
  if (member.type !== 'TSPropertySignature' && member.type !== 'TSMethodSignature') {
    return null
  }
  const key = member.key
  if (key.type === 'Identifier') return key.name
  if (key.type === 'Literal') return typeof key.value === 'string' ? key.value : null
  return null
}

/**
 * The sibling members of a reported `_tag` signature — the other members of
 * the same type literal or interface body. An empty array (no siblings) is
 * deliberately NOT an error shape.
 */
const siblingNamesOf = (node: ESTree.TSPropertySignature): readonly string[] => {
  const parent = node.parent
  const members = parent.type === 'TSTypeLiteral'
    ? parent.members
    : parent.type === 'TSInterfaceBody'
    ? parent.body
    : []
  const names: string[] = []
  for (const member of members) {
    if (member === node) continue
    const name = memberNameOf(member)
    if (name !== null) names.push(name)
  }
  return names
}

const ERROR_SIBLINGS = new Set(['name', 'message', 'cause'])

const isErrorShaped = (siblings: readonly string[]): boolean =>
  siblings.length > 0 && siblings.every((s) => ERROR_SIBLINGS.has(s))

/**
 * The nearest named ancestor binding of a (`TSPropertySignature`): the first
 * type alias, interface, function declaration, or variable declarator reached
 * walking parents. A destructured declarator bears no single name and is
 * skipped. Returns `null` when the property signature stands free of every
 * named binding.
 */
const namedAncestorOf = (node: ESTree.TSPropertySignature): string | null => {
  let current: ESTree.Node = node.parent
  while (current.type !== 'Program') {
    if (current.type === 'TSTypeAliasDeclaration' || current.type === 'TSInterfaceDeclaration') {
      return current.id.name
    }
    if (current.type === 'FunctionDeclaration') {
      if (current.id !== null) return current.id.name
    }
    if (current.type === 'VariableDeclarator') {
      if (current.id.type === 'Identifier') return current.id.name
    }
    current = current.parent
  }
  return null
}

export const noManualTagMember = defineRule({
  meta,
  create(context: Context) {
    // Every fix this rule names is a runtime value; a type-test fixture holds none.
    if (context.filename.endsWith('.tst.ts')) return {}

    return {
      TSPropertySignature(node: ESTree.TSPropertySignature) {
        if (!isTagKey(node.key)) return

        const ancestor = namedAncestorOf(node)
        const name = `${ancestor ?? ANONYMOUS_NAME} ${NAME_SUFFIX}`
        const expected = isErrorShaped(siblingNamesOf(node))
          ? EXPECTED_TAGGED_ERROR
          : EXPECTED_TAGGED_STRUCT

        context.report({
          node,
          messageId: 'forbidden',
          data: {
            name,
            expected,
            actual: ACTUAL_TXT,
            fix: FIX,
          },
        })
      },
    }
  },
})
