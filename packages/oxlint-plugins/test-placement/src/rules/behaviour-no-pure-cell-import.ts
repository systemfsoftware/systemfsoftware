import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  meta,
  PURE_CELL_IMPORT_ACTUAL,
  PURE_CELL_IMPORT_EXPECTED,
  PURE_CELL_IMPORT_FIX,
  PURE_CELL_IMPORT_NAME,
} from './behaviour-no-pure-cell-import.config.js'
import { INTEGRATION_SUFFIX, PURE_CELL_SUFFIXES } from './path.config.js'
import { basenameOf } from './path.js'

export type MessageIds = 'pureCellImport'

const stripJsExtension = (basename: string): string => basename.endsWith('.js') ? basename.slice(0, -3) : basename

const endsWithAnyCellSuffix = (basename: string): boolean => {
  const stem = stripJsExtension(basename)
  return PURE_CELL_SUFFIXES.some((suffix) => stem.endsWith(suffix))
}

const isBehaviourTest = (basename: string): boolean => basename.endsWith(INTEGRATION_SUFFIX)

const specifierBasename = (source: string): string => {
  const segments = source.split('/')
  return segments[segments.length - 1] as string
}

export const behaviourNoPureCellImport = defineRule({
  meta,
  create(context: Context) {
    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (!isBehaviourTest(basenameOf(context.filename))) return
        if (!endsWithAnyCellSuffix(specifierBasename(node.source.value))) return
        context.report({
          node: node.source,
          messageId: 'pureCellImport',
          data: {
            name: PURE_CELL_IMPORT_NAME,
            expected: PURE_CELL_IMPORT_EXPECTED,
            actual: PURE_CELL_IMPORT_ACTUAL,
            fix: PURE_CELL_IMPORT_FIX,
          },
        })
      },
    }
  },
})
