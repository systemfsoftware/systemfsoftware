import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { PROPERTY_CELLS, PROPERTY_SUFFIX } from './path.config.js'
import { basenameOf, isUnderSrc, propertyStem } from './path.js'
import {
  meta,
  UNSANCTIONED_CELL_ACTUAL,
  UNSANCTIONED_CELL_EXPECTED,
  UNSANCTIONED_CELL_FIX,
} from './src-property-test-cell.config.js'

export type MessageIds = 'unsanctionedCell'

const PROPERTY_CELL_SUFFIXES: ReadonlyArray<string> = PROPERTY_CELLS.map((cell) => `.${cell}`)

export const srcPropertyTestCell = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    const basename = basenameOf(filename)
    const isPropertyTest = basename.endsWith(PROPERTY_SUFFIX)
    const stem = propertyStem(basename)
    const matched = isPropertyTest && PROPERTY_CELL_SUFFIXES.some((suffix) => stem.endsWith(suffix))
    return {
      Program(node: ESTree.Program) {
        if (!isUnderSrc(filename)) return
        if (!isPropertyTest) return
        if (matched) return
        context.report({
          node,
          messageId: 'unsanctionedCell',
          data: {
            name: basename,
            expected: UNSANCTIONED_CELL_EXPECTED,
            actual: UNSANCTIONED_CELL_ACTUAL,
            fix: UNSANCTIONED_CELL_FIX,
          },
        })
      },
    }
  },
})
