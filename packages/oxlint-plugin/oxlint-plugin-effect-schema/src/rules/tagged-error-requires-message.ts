import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { originFinalMember, resolveImportOrigin } from '@systemfsoftware/oxlint-import-origin'
import { isSchemaVocabularyOrigin } from './SchemaVocabulary.js'
import {
  ACTUAL,
  ANONYMOUS_NAME,
  EXPECTED,
  FIX,
  isExemptFile,
  MESSAGE_MEMBER,
  meta,
  NAME_SUFFIX,
  TAG_ERROR_MEMBER,
} from './tagged-error-requires-message.config.js'

export type MessageIds = 'missingMessage'

type GetScope = (node: ESTree.Node) => unknown

const isMessageKey = (key: ESTree.Node): boolean => {
  if (key.type === 'Identifier') return key.name === MESSAGE_MEMBER
  if (key.type === 'Literal') return key.value === MESSAGE_MEMBER
  return false
}

const classDeclaresMessage = (cls: ESTree.Class): boolean => {
  for (const member of cls.body.body) {
    if (member.type === 'MethodDefinition' && member.kind === 'get' && isMessageKey(member.key)) return true
    if (member.type === 'PropertyDefinition' && isMessageKey(member.key)) return true
  }
  return false
}

const objectDeclaresMessage = (node: ESTree.ObjectExpression): boolean =>
  node.properties.some((property) => property.type === 'Property' && isMessageKey(property.key))

const typeLiteralDeclaresMessage = (node: ESTree.TSTypeLiteral): boolean =>
  node.members.some((member) => member.type === 'TSPropertySignature' && isMessageKey(member.key))

const superArgumentsDeclareMessage = (
  typeArguments: ESTree.TSTypeParameterInstantiation | null | undefined,
): boolean =>
  typeArguments !== null &&
  typeArguments !== undefined &&
  typeArguments.params.some((param) => param.type === 'TSTypeLiteral' && typeLiteralDeclaresMessage(param))

const fieldsCarryMessage = (superClass: ESTree.Node): boolean =>
  superClass.type === 'CallExpression' &&
  superClass.arguments.some((argument) => argument.type === 'ObjectExpression' && objectDeclaresMessage(argument))

const taggedErrorMemberOf = (superClass: ESTree.Node, getScope: GetScope): ESTree.Node | null => {
  let current = superClass
  while (current.type === 'CallExpression') current = current.callee
  const origin = resolveImportOrigin(current, getScope)
  if (origin === null || !isSchemaVocabularyOrigin(origin)) return null
  return originFinalMember(origin) === TAG_ERROR_MEMBER ? current : null
}

const classNameOf = (node: ESTree.Class): string => node.id?.type === 'Identifier' ? node.id.name : ANONYMOUS_NAME

export const taggedErrorRequiresMessage = defineRule({
  meta,
  create(context: Context) {
    if (isExemptFile(context.filename)) return {}
    const getScope: GetScope = context.sourceCode.getScope

    const check = (node: ESTree.Class) => {
      const superClass = node.superClass
      if (superClass === null) return
      const member = taggedErrorMemberOf(superClass, getScope)
      if (member === null) return
      if (classDeclaresMessage(node)) return
      if (fieldsCarryMessage(superClass)) return
      if (superArgumentsDeclareMessage(node.superTypeArguments)) return
      context.report({
        node: member,
        messageId: 'missingMessage',
        data: {
          name: `class ${classNameOf(node)} ${NAME_SUFFIX}`,
          expected: EXPECTED,
          actual: ACTUAL,
          fix: FIX,
        },
      })
    }

    return {
      ClassDeclaration: check,
      ClassExpression: check,
    }
  },
})
