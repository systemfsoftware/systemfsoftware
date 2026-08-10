import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { ACTUAL, COMBINATOR_FILE, EXPECTED, FIX, KERNEL_IMPORT, meta } from './combinator-composes-a-kernel.config.js'

export type MessageIds = 'kernelImportMissing'

export const combinatorComposesAKernel = defineRule({
  meta,
  create(context: Context) {
    if (!COMBINATOR_FILE.test(context.filename)) return {}

    const name = context.filename.slice(context.filename.lastIndexOf('/') + 1)
    let hasKernelImport = false
    let program: ESTree.Program | null = null

    return {
      Program(node: ESTree.Program) {
        program = node
      },
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (node.source.value.endsWith(KERNEL_IMPORT)) hasKernelImport = true
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.source !== null && node.source.value.endsWith(KERNEL_IMPORT)) hasKernelImport = true
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        if (node.source.value.endsWith(KERNEL_IMPORT)) hasKernelImport = true
      },
      'Program:exit'() {
        if (hasKernelImport) return
        if (program === null) return
        context.report({
          node: program.body[0] ?? program,
          messageId: 'kernelImportMissing',
          data: {
            name,
            expected: EXPECTED,
            actual: ACTUAL,
            fix: FIX,
          },
        })
      },
    }
  },
})
