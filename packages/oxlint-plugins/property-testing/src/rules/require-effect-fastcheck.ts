import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { FAST_CHECK_PACKAGE, meta } from './require-effect-fastcheck.config.js'

export type MessageIds = 'rawFastCheckImport' | 'fastCheckAlias'

const isFastCheckSource = (source: string): boolean =>
  source === FAST_CHECK_PACKAGE || source.startsWith(`${FAST_CHECK_PACKAGE}/`)

export const requireEffectFastcheck = defineRule({
  meta,
  create(context: Context) {
    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = node.source.value
        if (isFastCheckSource(source)) {
          context.report({
            node,
            messageId: 'rawFastCheckImport',
            data: {
              name: `import from '${source}'`,
              expected: "import { FastCheck as fc } from 'effect'",
              actual: `FastCheck imported from '${source}'`,
              fix: "delete the 'fast-check' import; add FastCheck as fc to the existing 'effect' import",
            },
          })
          return
        }
        if (source !== 'effect' || node.importKind === 'type') return
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier' &&
            specifier.imported.name === 'FastCheck' && specifier.importKind !== 'type' &&
            specifier.local.name !== 'fc'
          ) {
            context.report({
              node: specifier,
              messageId: 'fastCheckAlias',
              data: {
                name: `FastCheck imported as '${specifier.local.name}'`,
                expected: "import { FastCheck as fc } from 'effect'",
                actual: `aliased to '${specifier.local.name}'`,
                fix: 'rename the alias to fc — every rule and reader assumes the `fc` namespace',
              },
            })
          }
        }
      },
    }
  },
})
