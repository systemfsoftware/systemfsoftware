import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { EFFECT_FASTCHECK_SOURCES, FAST_CHECK_PACKAGE, meta } from './require-effect-fastcheck.config.js'

export type MessageIds = 'rawFastCheckImport' | 'effectFastCheckImport'

const isFastCheckSource = (source: string): boolean =>
  source === FAST_CHECK_PACKAGE || source.startsWith(`${FAST_CHECK_PACKAGE}/`)

const isEffectFastCheckSource = (source: string): boolean => EFFECT_FASTCHECK_SOURCES[source] === true

/** The ban disciplines property-test authoring; only sources under a `src/` folder build property inputs. */
const isSourceFile = (filename: string): boolean => filename.startsWith('src/') || filename.includes('/src/')
export const requireEffectFastcheck = defineRule({
  meta,
  create(context: Context) {
    if (!isSourceFile(context.filename)) return {}
    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = node.source.value
        if (isFastCheckSource(source)) {
          context.report({
            node,
            messageId: 'rawFastCheckImport',
            data: {
              name: `import from '${source}'`,
              expected: 'no FastCheck import — pass Effect Schemas directly to it.prop',
              actual: `FastCheck imported from '${source}'`,
              fix: 'delete the fast-check import; pass the Schema directly to it.prop([DomainSchema])',
            },
          })
          return
        }
        if (!isEffectFastCheckSource(source) || node.importKind === 'type') return
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier' &&
            specifier.imported.name === 'FastCheck' && specifier.importKind !== 'type'
          ) {
            context.report({
              node: specifier,
              messageId: 'effectFastCheckImport',
              data: {
                name: `FastCheck imported from '${source}'`,
                expected: 'no FastCheck import — pass Effect Schemas directly to it.prop',
                actual: `FastCheck imported from '${source}'`,
                fix: 'delete the FastCheck import; pass the Schema directly to it.prop([DomainSchema])',
              },
            })
          }
        }
      },
    }
  },
})
