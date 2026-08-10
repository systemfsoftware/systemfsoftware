import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import { meta } from './no-wildcard-reexport.config.js'

export type MessageIds = 'wildcardReexport'

export const noWildcardReexport = defineRule({
  meta,
  create(context: Context) {
    return {
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        // Verified against oxc 0.140: bare `export *` / `export type *` carry
        // `exported: null`; `export * as Ns` carries the alias in `exported`.
        // The namespace form is a chunking device and must stay exempt.
        if (node.exported !== null) {
          return
        }

        context.report({
          node,
          messageId: 'wildcardReexport',
          data: { source: node.source.value },
        })
      },
    }
  },
})
