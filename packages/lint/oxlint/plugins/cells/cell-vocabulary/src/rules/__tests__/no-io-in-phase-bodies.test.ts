import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { Cell } from '@systemfsoftware/effect-cell-types'

import {
  IO_IN_PHASE_BODY_ACTUAL,
  IO_IN_PHASE_BODY_EXPECTED,
  IO_IN_PHASE_BODY_FIX,
} from '../no-io-in-phase-bodies.config.js'
import { noIoInPhaseBodies } from '../no-io-in-phase-bodies.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester()

// Every axis value in the fixtures below is derived from the walked vocabulary at
// runtime, never spelled: the import's module name, the fixture's I/O cell suffix and
// I/O module source all come from Cell.vocabulary, and the message's phase list comes
// from the same fold the rule uses. If the derivation is severed, the expected data no
// longer matches the rendered message and the invalid fixtures stop reporting.
const CELL_IMPORT = `import { Cell } from '${Cell.vocabulary.module}'`
const storeCell = Cell.vocabulary.ioCells.cells[0]
const ioSource = Cell.vocabulary.ioCells.sources[0]
const STORE_IMPORT = `import { findOrderRow } from './order.${storeCell}.js'`
const CLOCK_IMPORT = `import * as Clock from '${ioSource}'`
const EFFECT_IMPORT = `import * as Effect from 'effect/Effect'`

// The last walked entry on each axis, so the fixtures span the enumeration rather than its
// first element: a predicate comparing against `cells[0]` instead of testing membership
// passes every fixture above and fails only these two.
const lastCell = Cell.vocabulary.ioCells.cells.at(-1)
const lastSource = Cell.vocabulary.ioCells.sources.at(-1)
const LAST_CELL_IMPORT = `import { loadRow } from './order.${lastCell}.js'`
const LAST_SOURCE_IMPORT = `import * as Io from '${lastSource}'`

const error = (name: string) =>
  ({
    messageId: 'ioInPhaseBody',
    data: {
      name,
      expected: IO_IN_PHASE_BODY_EXPECTED.replace('{{phases}}', Cell.vocabulary.byKind.pure.join(', ')),
      actual: IO_IN_PHASE_BODY_ACTUAL.replace('{{phases}}', Cell.vocabulary.byKind.pure.join(', ')),
      fix: IO_IN_PHASE_BODY_FIX,
    },
  }) as const

ruleTester.run('no-io-in-phase-bodies', noIoInPhaseBodies, {
  valid: [
    {
      name: 'Should_ReportNothing_When_PurePhaseBodyOnlyTransformsItsInput',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const cell = Cell.layer({
  read: (cmd) => Effect.succeed(cmd),
  decode: (raw) => ({ ...raw, seen: true }),
  decide: (decoded) => decoded,
  write: (outcome) => Effect.succeed(outcome),
})`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_ImpurePhaseBodyPerformsIo',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
${EFFECT_IMPORT}
const cell = Cell.layer({
  read: (cmd) => Effect.succeed(findOrderRow(cmd.id)),
  decode: (raw) => raw,
  decide: (decoded) => decoded,
  write: (outcome) => Effect.succeed(findOrderRow(outcome.id)),
})`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_ComposerMemberBelongsToAnotherModuleExport',
      code: `import { Policy } from '@systemfsoftware/effect-cell-types'
${STORE_IMPORT}
const cell = Policy.layer({
  read: (cmd) => Effect.succeed(findOrderRow(cmd.id)),
  decode: (raw) => raw,
})`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_IoCallSitsOutsideAPhaseBody',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
const row = findOrderRow('id-1')`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_LocalHelperCalledFromPurePhaseHasNoIo',
      code: `${CELL_IMPORT}
const transform = (raw) => ({ ...raw, seen: true })
const cell = Cell.layer({
  read: (cmd) => cmd,
  decode: transform,
})`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_ImportSourceIsNotAWalkedIoCell',
      code: `${CELL_IMPORT}
import { decide } from './order.workflow.js'
const cell = Cell.layer({
  read: (cmd) => decide(cmd),
})`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_BindingNameSpellsLikeAnIoCellWithoutTheImportEdge',
      code: `${CELL_IMPORT}
const store = { save: (id) => id }
const cell = Cell.layer({
  read: (cmd) => store.save(cmd.id),
})`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_ComposerObjectIsNotAnImportBinding',
      code: `${CELL_IMPORT}
const Other = Cell
const cell = Other.layer({
  read: (cmd) => cmd,
})`,
      filename: 'confirm-order.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_IoCellCall_When_LayerSpecPureBodyCallsIt',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
${EFFECT_IMPORT}
const cell = Cell.layer({
  read: (cmd) => Effect.succeed(cmd),
  decode: (raw) => ({ id: findOrderRow(raw.id) }),
  decide: (decoded) => decoded,
  write: (outcome) => Effect.succeed(outcome),
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      name: 'Should_Report_IoCallInsideHelper_When_LayerSpecPureBodyHandsOverTheHelper',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
const loadRow = (id) => findOrderRow(id)
const cell = Cell.layer({
  read: (cmd) => cmd,
  decode: loadRow,
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      name: 'Should_Report_IoSourceCall_When_PurePhaseBodyCallsIt',
      code: `${CELL_IMPORT}
${CLOCK_IMPORT}
const cell = Cell.layer({
  read: (cmd) => cmd,
  decode: (raw) => Clock.currentTimeMillis(),
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('Clock')],
    },
    {
      name: 'Should_Report_IoCallInsideLocalHelper_When_PurePhaseCallsTheHelper',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
const loadRow = (id) => findOrderRow(id)
const cell = Cell.layer({
  read: (cmd) => cmd,
  decode: (raw) => loadRow(raw.id),
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      // The same helper, exported. `export const` is an ExportNamedDeclaration wrapping the
      // declaration, so a walker that scans `Program.body` for bare VariableDeclaration
      // stops following it and the I/O it reaches goes unreported.
      name: 'Should_Report_IoCallInsideExportedHelper_When_PurePhaseCallsTheHelper',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
export const loadRow = (id) => findOrderRow(id)
const cell = Cell.layer({
  read: (cmd) => cmd,
  decode: (raw) => loadRow(raw.id),
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      name: 'Should_Report_IoCellCall_When_CellNamespaceImported',
      code: `import * as Description from '@systemfsoftware/effect-cell-types'
${STORE_IMPORT}
const cell = Description.layer({
  read: (cmd) => cmd,
  decode: (raw) => ({ id: findOrderRow(raw.id) }),
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      name: 'Should_Report_IoCellCall_When_PhaseBodyIsTheCallItself',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
const cell = Cell.layer({
  decode: (raw) => findOrderRow(raw),
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      name: 'Should_Report_IoCellCall_When_CellIsTheLastWalkedEntry',
      code: `${CELL_IMPORT}
${LAST_CELL_IMPORT}
const cell = Cell.layer({
  decode: (raw) => loadRow(raw),
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('loadRow')],
    },
    {
      name: 'Should_Report_IoSourceCall_When_SourceIsTheLastWalkedEntry',
      code: `${CELL_IMPORT}
${LAST_SOURCE_IMPORT}
const cell = Cell.layer({
  decode: (raw) => Io.read(raw),
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('Io')],
    },
    {
      // The import sits below the call. Listeners fire in document order, so a rule that
      // registered its I/O names from an `ImportDeclaration` listener judged this call against
      // empty sets and reported nothing — a silent pass decided by line order.
      name: 'Should_Report_IoCellCall_When_ImportFollowsThePhaseCall',
      code: `${CELL_IMPORT}
const cell = Cell.layer({
  decode: (raw) => findOrderRow(raw),
})
${STORE_IMPORT}`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      // The body is hoisted to a name and handed over by reference. Same phase body, one
      // indirection — and the message claims module-level helpers are followed.
      name: 'Should_Report_IoCellCall_When_PhaseBodyIsPassedByReference',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
const transform = (raw) => findOrderRow(raw)
const cell = Cell.layer({
  decode: transform,
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      // A helper written as a `function` declaration rather than an arrow. Nothing else in the
      // suite reaches that branch of the top-level scan.
      name: 'Should_Report_IoCallInsideHelper_When_HelperIsAFunctionDeclaration',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
function loadRow(id) {
  return findOrderRow(id)
}
const cell = Cell.layer({
  decode: (raw) => loadRow(raw),
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      // `export default function` — the other wrapper a helper stays callable through.
      name: 'Should_Report_IoCallInsideHelper_When_HelperIsDefaultExported',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
export default function loadRow(id) {
  return findOrderRow(id)
}
const cell = Cell.layer({
  decode: (raw) => loadRow(raw),
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      // A helper bound to a `function` expression rather than an arrow.
      name: 'Should_Report_IoCallInsideHelper_When_HelperIsAFunctionExpression',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
const loadRow = function (id) {
  return findOrderRow(id)
}
const cell = Cell.layer({
  decode: (raw) => loadRow(raw),
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      // The phase body itself written as a `function` expression, not an arrow.
      name: 'Should_Report_IoCellCall_When_PhaseBodyIsAFunctionExpression',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
const cell = Cell.layer({
  decode: function (raw) {
    return findOrderRow(raw)
  },
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      // A by-reference body that also calls itself. The walk seeds `visited` with the helper it
      // entered, so the self-call is not re-walked and the single I/O call reports once. Without
      // that seeding the recursion re-enters and the same call is reported twice.
      name: 'Should_ReportOnce_When_ByReferenceHelperCallsItself',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
const loadRow = (id) => (id > 0 ? loadRow(id - 1) : findOrderRow(id))
const cell = Cell.layer({
  decode: loadRow,
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      // An I/O call inside a closure declared in the body and never invoked. The walk descends the
      // body's whole subtree, so this reports — and the message says "written inside ... at any
      // depth" rather than "reached", because syntax cannot decide invocation. This fixture is what
      // makes that wording falsifiable: narrow the walk to stop at nested functions and it fails.
      name: 'Should_Report_IoCall_When_WrittenInNeverInvokedNestedClosure',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
const cell = Cell.layer({
  decode: (raw) => {
    const unused = () => findOrderRow(raw.id)
    return raw
  },
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
  ],
})
