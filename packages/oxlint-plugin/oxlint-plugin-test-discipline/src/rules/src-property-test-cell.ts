import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'
import { PROPERTY_SUFFIX, WORKFLOW_TEST_BASENAME } from './path.config.js'
import { basenameOf, cellOf, isTestFile, isUnderSrc } from './path.js'
import {
  meta,
  MISSING_CELL_TEST_ACTUAL,
  MISSING_CELL_TEST_EXPECTED,
  MISSING_CELL_TEST_FIX,
  Options,
  UNSANCTIONED_CELL_ACTUAL,
  UNSANCTIONED_CELL_EXPECTED,
  UNSANCTIONED_CELL_FIX,
} from './src-property-test-cell.config.js'
import { isVitestGuard } from './vitest-guard.js'

export type MessageIds = 'unsanctionedCell' | 'missingCellTest'

const carriesInSourceBlock = (body: readonly (ESTree.Statement | ESTree.ModuleDeclaration)[]): boolean =>
  body.some((statement) => statement.type === 'IfStatement' && isVitestGuard(statement.test))

export const srcPropertyTestCell = defineRule({
  meta,
  create(context: Context) {
    const { cellsRequiringTest } = S.decodeUnknownSync(Options)(context.options[0] ?? {})
    const filename = context.filename
    const basename = basenameOf(filename)
    if (!isUnderSrc(filename)) return {}

    if (basename.endsWith(PROPERTY_SUFFIX)) {
      if (WORKFLOW_TEST_BASENAME.test(basename)) return {}
      return {
        Program(node: ESTree.Program) {
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
    }

    if (isTestFile(basename)) return {}
    const cell = cellOf(basename)
    if (cell === undefined) return {}
    if (!cellsRequiringTest.includes(cell)) return {}
    return {
      Program(node: ESTree.Program) {
        if (carriesInSourceBlock(node.body)) return
        context.report({
          node,
          messageId: 'missingCellTest',
          data: {
            name: basename,
            expected: MISSING_CELL_TEST_EXPECTED,
            actual: MISSING_CELL_TEST_ACTUAL,
            fix: MISSING_CELL_TEST_FIX,
          },
        })
      },
    }
  },
})
