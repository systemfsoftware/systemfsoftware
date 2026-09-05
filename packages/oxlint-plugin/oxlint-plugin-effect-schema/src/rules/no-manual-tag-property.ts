import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'
import {
  ACTUAL_TXT,
  ANONYMOUS_NAME,
  meta,
  NAME_SUFFIX,
  Options,
  type OptionsType,
  TAG_NAME,
} from './no-manual-tag-property.config.js'

export type MessageIds = 'forbidden'

const isTagPropertyKey = (node: ESTree.Node): boolean => {
  if (node.type === 'Identifier') return node.name === TAG_NAME
  if (node.type === 'Literal') return node.value === TAG_NAME
  return false
}

const isTagParameter = (param: ESTree.Node): boolean => param.type === 'Identifier' && param.name === TAG_NAME

const isTagAssignmentPattern = (param: ESTree.Node): boolean =>
  param.type === 'AssignmentPattern' &&
  param.left.type === 'Identifier' &&
  param.left.name === TAG_NAME

const findTagPropertyInClass = (cls: ESTree.Class): ESTree.Node | null => {
  for (const el of cls.body.body) {
    if (
      el.type === 'PropertyDefinition' &&
      !el.computed &&
      isTagPropertyKey(el.key)
    ) {
      return el.key
    }

    if (el.type === 'MethodDefinition') {
      for (const p of el.value.params) {
        if (p.type !== 'TSParameterProperty') continue
        if (isTagParameter(p.parameter) || isTagAssignmentPattern(p.parameter)) {
          return p
        }
      }
    }
  }
  return null
}

const getClassName = (node: ESTree.Class): string => node.id?.type === 'Identifier' ? node.id.name : ANONYMOUS_NAME

export const noManualTagProperty = defineRule({
  meta,
  create(context: Context) {
    const options: OptionsType = S.decodeUnknownSync(Options)(context.options[0] ?? {})
    const allow = new Set(options.allow.map((s) => s.toLowerCase()))

    const checkClass = (node: ESTree.Class) => {
      const tagNode = findTagPropertyInClass(node)
      if (!tagNode) return
      const className = getClassName(node)
      if (allow.has(className.toLowerCase())) return

      context.report({
        node: tagNode,
        messageId: 'forbidden',
        data: {
          name: `class ${className} ${NAME_SUFFIX}`,
          expected: options.expected,
          actual: ACTUAL_TXT,
          fix: options.fix,
        },
      })
    }

    return {
      ClassDeclaration(node: ESTree.Class) {
        checkClass(node)
      },
      ClassExpression(node: ESTree.Class) {
        checkClass(node)
      },
    }
  },
})
