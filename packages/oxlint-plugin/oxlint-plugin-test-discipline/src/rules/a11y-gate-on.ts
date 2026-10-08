import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta } from './a11y-gate-on.config.js'

export type MessageIds = 'a11yTestNotError' | 'a11yDisabled'

type NamedProperty = { readonly computed: boolean; readonly key: ESTree.Node }

const propertyName = (property: NamedProperty): string | undefined => {
  if (property.computed) return undefined
  if (property.key.type === 'Identifier') return property.key.name
  return property.key.type === 'Literal' && typeof property.key.value === 'string' ? property.key.value : undefined
}

export const a11yGateOn = defineRule({
  meta,
  create(context: Context) {
    return {
      Property(node: ESTree.Node) {
        if (node.type !== 'Property' || node.computed) return
        if (propertyName(node) !== 'a11y' || node.value.type !== 'ObjectExpression') return
        for (const entry of node.value.properties) {
          if (entry.type !== 'Property') continue
          const key = propertyName(entry)
          if (key === 'test' && entry.value.type === 'Literal' && typeof entry.value.value === 'string') {
            if (entry.value.value !== 'error') {
              context.report({ node: entry, messageId: 'a11yTestNotError', data: { actual: entry.value.value } })
            }
          } else if (key === 'disable' && entry.value.type === 'Literal' && entry.value.value === true) {
            context.report({ node: entry, messageId: 'a11yDisabled' })
          }
        }
      },
    }
  },
})
