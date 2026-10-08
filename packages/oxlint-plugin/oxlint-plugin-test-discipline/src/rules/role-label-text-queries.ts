import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta } from './role-label-text-queries.config.js'

export type MessageIds = 'bannedQuery' | 'hasOption' | 'dataAttributeSelector'

const BANNED_METHODS: Record<string, true | undefined> = {
  locator: true,
  $: true,
  $$: true,
  $eval: true,
  $$eval: true,
  querySelector: true,
  querySelectorAll: true,
  closest: true,
  getByTestId: true,
  getByPlaceholder: true,
  getByAltText: true,
  getByTitle: true,
  frameLocator: true,
}

const BANNED_OPTIONS: Record<string, true | undefined> = { has: true, hasNot: true }

const DATA_ATTRIBUTE = '[data-'

const memberName = (member: ESTree.MemberExpression): string | undefined => {
  if (member.computed) {
    return member.property.type === 'Literal' && typeof member.property.value === 'string'
      ? member.property.value
      : undefined
  }
  return member.property.type === 'Identifier' ? member.property.name : undefined
}

const propertyName = (property: ESTree.ObjectProperty): string | undefined => {
  if (property.computed) return undefined
  if (property.key.type === 'Identifier') return property.key.name
  return property.key.type === 'Literal' && typeof property.key.value === 'string' ? property.key.value : undefined
}

const selectorIn = (argument: ESTree.Node): string | undefined => {
  if (argument.type === 'Literal' && typeof argument.value === 'string' && argument.value.includes(DATA_ATTRIBUTE)) {
    return argument.value
  }
  if (argument.type === 'TemplateLiteral') {
    for (const quasi of argument.quasis) {
      const cooked = quasi.value.cooked
      if (cooked !== null && cooked.includes(DATA_ATTRIBUTE)) return cooked
    }
  }
  return undefined
}

export const roleLabelTextQueries = defineRule({
  meta,
  create(context: Context) {
    return {
      CallExpression(node: ESTree.CallExpression) {
        const callee = node.callee
        if (callee.type === 'MemberExpression') {
          const name = memberName(callee)
          if (name !== undefined && BANNED_METHODS[name] === true) {
            context.report({ node, messageId: 'bannedQuery', data: { name } })
          }
        }
        for (const argument of node.arguments) {
          if (argument.type !== 'ObjectExpression') continue
          for (const property of argument.properties) {
            if (property.type !== 'Property') continue
            const name = propertyName(property)
            if (name !== undefined && BANNED_OPTIONS[name] === true) {
              context.report({ node: property, messageId: 'hasOption', data: { name } })
            }
          }
        }
        for (const argument of node.arguments) {
          const snippet = selectorIn(argument)
          if (snippet !== undefined) {
            context.report({ node, messageId: 'dataAttributeSelector', data: { snippet } })
            break
          }
        }
      },
    }
  },
})
