import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { BRAND_ACTUAL, BRAND_EXPECTED, BRAND_FIX, meta } from './schema-brand-requires-filter.config.js'
import { collectBrandSites } from './SchemaChain.js'

export type MessageIds = 'brandWithoutFilter'

type GetScope = (node: ESTree.Node) => unknown

export const schemaBrandRequiresFilter = defineRule({
  meta,
  create(context: Context) {
    const getScope: GetScope = context.sourceCode.getScope
    return {
      CallExpression(node: ESTree.CallExpression) {
        for (const site of collectBrandSites(node, getScope)) {
          if (!site.fires) continue
          context.report({
            node: site.node,
            messageId: 'brandWithoutFilter',
            data: {
              name: site.brand === null
                ? 'a brand with no runtime filter'
                : `a brand ('${site.brand}') with no runtime filter`,
              expected: BRAND_EXPECTED,
              actual: BRAND_ACTUAL,
              fix: BRAND_FIX,
            },
          })
        }
      },
    }
  },
})
