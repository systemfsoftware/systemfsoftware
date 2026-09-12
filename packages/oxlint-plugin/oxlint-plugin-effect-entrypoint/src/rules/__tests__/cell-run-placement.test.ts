import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { CELL_RUN, CELL_RUN_ACTUAL, CELL_RUN_EXPECTED, CELL_RUN_FIX } from '../cell-run-placement.config.js'
import { cellRunPlacement } from '../cell-run-placement.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

const CELL_RUN_REPORT = {
  messageId: 'cellRunOutsideEntrypoint',
  data: {
    name: CELL_RUN,
    expected: CELL_RUN_EXPECTED,
    actual: CELL_RUN_ACTUAL,
    fix: CELL_RUN_FIX,
  },
} as const

ruleTester.run('cell-run-placement', cellRunPlacement, {
  valid: [
    {
      name: 'Should_Pass_When_TheEntrypointRunsTheCell',
      code: `import { Cell } from '@systemfsoftware/effect-cell-types'

Cell.run(verdictCell, { id: 'abcd' })`,
      filename: 'src/main.ts',
    },
    {
      name: 'Should_Pass_When_ATestFileRunsTheCell',
      code: `import { Cell } from '@systemfsoftware/effect-cell-types'

Cell.run(verdictCell, { id: 'abcd' })`,
      filename: 'src/verdict.integration.test.ts',
    },
    {
      name: 'Should_Pass_When_TheCellComesFromAnotherModule',
      code: `import { Cell } from './ledger-cell.js'

Cell.run(ledgerCell, { id: 'abcd' })`,
      filename: 'src/Output.ts',
    },
    {
      name: 'Should_Pass_When_CellIsALocalBinding',
      code: `const Cell = { run: (id: string) => id }

Cell.run('abcd')`,
      filename: 'src/Output.ts',
    },
    {
      name: 'Should_Pass_When_TheCellNamespaceBuildsWithoutRunning',
      code: `import { Cell } from '@systemfsoftware/effect-cell-types'

Cell.layer({ read, decide, write })`,
      filename: 'src/Output.ts',
    },
    {
      // Kills the mutant that drops the `computed` guard: `Cell[run]` names the
      // same member through a key nothing static can read, so it stays quiet.
      name: 'Should_Pass_When_TheRunMemberIsComputed',
      code: `import { Cell } from '@systemfsoftware/effect-cell-types'

Cell[run](verdictCell, { id: 'abcd' })`,
      filename: 'src/Output.ts',
    },
    {
      name: 'Should_Pass_When_TheCalleeIsNotAMemberExpression',
      code: `import { Cell } from '@systemfsoftware/effect-cell-types'

run(verdictCell, { id: 'abcd' })`,
      filename: 'src/Output.ts',
    },
    {
      name: 'Should_Pass_When_TheReceiverIsNotAName',
      code: `import { Cell } from '@systemfsoftware/effect-cell-types'

buildCell(Cell).run({ id: 'abcd' })`,
      filename: 'src/Output.ts',
    },
    {
      name: 'Should_Pass_When_ThePackageIsImportedWithoutItsCell',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

Workflow.run(admitAmount, command)`,
      filename: 'src/admit-amount.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_TheLayerModuleRunsTheCell',
      code: `import { Cell } from '@systemfsoftware/effect-cell-types'

export const detectModeWithProbe = (flags) => Cell.run(outputModeProbeCell, flags)`,
      filename: 'src/Output.ts',
      errors: [CELL_RUN_REPORT],
    },
    {
      // Kills the mutant that reads every named import's local name: an alias
      // is still the package's `Cell` export.
      name: 'Should_Report_When_TheAliasedImportRunsTheCell',
      code: `import { Cell as Cells } from '@systemfsoftware/effect-cell-types'

Cells.run(survivorsAdmissionCell(basePath), cliOptions)`,
      filename: 'src/Survivors.ts',
      errors: [CELL_RUN_REPORT],
    },
    {
      // Kills the ternary survivor on the literal arm of the imported name: a
      // string-named import of `Cell` is the same export as the bare one.
      name: 'Should_Report_When_TheStringNamedImportRunsTheCell',
      code: `import { 'Cell' as C } from '@systemfsoftware/effect-cell-types'

C.run(verify, new CheckMutantsCommand({ mutants: [mutant] }))`,
      filename: 'src/Checker.ts',
      errors: [CELL_RUN_REPORT],
    },
    {
      name: 'Should_Report_When_TheNamespaceImportRunsTheCell',
      code: `import * as Cell from '@systemfsoftware/effect-cell-types'

Cell.run(instrumentCell, prepared)`,
      filename: 'src/engine/Run.ts',
      errors: [CELL_RUN_REPORT],
    },
  ],
})
