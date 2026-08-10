import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta } from './workflow-no-effect-import.config.js'

export type MessageIds = 'topLevelEffectImport' | 'effectRuntimeImport'

const isWorkflowFile = (filename: string): boolean => filename.endsWith('.workflow.ts')

const isTopLevelEffectImport = (source: string): boolean => source === 'effect'

const isEffectRuntimeImport = (node: ESTree.ImportDeclaration): boolean => {
  const source = node.source.value
  if (source === 'effect/Effect') return true
  if (!isTopLevelEffectImport(source)) return false

  for (const spec of node.specifiers) {
    if (spec.type === 'ImportSpecifier' && spec.imported.type === 'Identifier') {
      if (spec.imported.name === 'Effect') return true
    }
    if (spec.type === 'ImportDefaultSpecifier' && spec.local.name === 'Effect') return true
    if (spec.type === 'ImportNamespaceSpecifier' && spec.local.name === 'Effect') return true
  }
  return false
}

export const workflowNoEffectImport = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!isWorkflowFile(filename)) return {}

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = node.source.value

        if (isEffectRuntimeImport(node)) {
          context.report({
            node,
            messageId: 'effectRuntimeImport',
            data: {
              name: 'effect/Effect',
              expected: 'no effect runtime import',
              actual: `an import of ${source}`,
              fix:
                'a workflow is a pure decision — move the runtime concern to the executor and pass its result as command data',
            },
          })
          return
        }

        if (isTopLevelEffectImport(source)) {
          context.report({
            node,
            messageId: 'topLevelEffectImport',
            data: {
              name: source,
              expected: 'a specific effect submodule (e.g. effect/Schema), not the effect barrel',
              actual: `an import of ${source}`,
              fix: 'import from the specific effect submodule you need instead of the barrel',
            },
          })
        }
      },
    }
  },
})
