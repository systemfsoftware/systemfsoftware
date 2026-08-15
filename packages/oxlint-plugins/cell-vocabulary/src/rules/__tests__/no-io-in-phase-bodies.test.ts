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

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

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
const EITHER_IMPORT = `import * as Either from 'effect/Either'`
const PIPE_IMPORT = `import { pipe } from 'effect/Function'`

// The last walked entry on each axis, so the fixtures span the enumeration rather than its
// first element: a predicate comparing against `cells[0]` instead of testing membership
// passes every fixture above and fails only these two.
const lastCell = Cell.vocabulary.ioCells.cells.at(-1)
const lastSource = Cell.vocabulary.ioCells.sources.at(-1)
const LAST_CELL_IMPORT = `import { loadRow } from './order.${lastCell}.js'`
const LAST_SOURCE_IMPORT = `import * as Io from '${lastSource}'`

const PURE_PHASE_LIST = Cell.vocabulary.byKind.pure.join(', ')

const error = (name: string) =>
  ({
    messageId: 'ioInPhaseBody',
    data: {
      name,
      expected: IO_IN_PHASE_BODY_EXPECTED.replace('{{phases}}', PURE_PHASE_LIST),
      actual: IO_IN_PHASE_BODY_ACTUAL.replace('{{phases}}', PURE_PHASE_LIST),
      fix: IO_IN_PHASE_BODY_FIX,
    },
  }) as const

const DESCRIPTION = `${CELL_IMPORT}
${STORE_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
const description = pipe(
  Cell.read((cmd) => Effect.succeed(cmd)),
  Cell.decode((raw) => Either.right({ ...raw, seen: true })),
  Cell.decide((decoded) => Either.right(decoded)),
  Cell.encode((outcome) => outcome),
  Cell.write((outcome) => Effect.succeed(outcome)),
)`

ruleTester.run('no-io-in-phase-bodies', noIoInPhaseBodies, {
  valid: [
    {
      name: 'Should_ReportNothing_When_PurePhaseBodyOnlyTransformsItsInput',
      code: DESCRIPTION,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_ImpurePhaseBodyPerformsIo',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
const description = pipe(
  Cell.read((cmd) => Effect.succeed(findOrderRow(cmd.id))),
  Cell.decode((raw) => Either.right(raw)),
  Cell.decide((decoded) => Either.right(decoded)),
  Cell.encode((outcome) => outcome),
  Cell.write((outcome) => Effect.succeed(findOrderRow(outcome.id))),
)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_PhaseMemberBelongsToAnotherModuleExport',
      code: `import { Policy } from '@systemfsoftware/effect-cell-types'
${STORE_IMPORT}
const decision = Policy.decide((decoded) => Either.right(findOrderRow(decoded.id)))`,
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
const description = Cell.decode((raw) => transform(raw))`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_ImportSourceIsNotAWalkedIoCell',
      code: `${CELL_IMPORT}
import { decide } from './order.workflow.js'
const description = Cell.decode((raw) => Either.right(decide(raw)))`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_BindingNameSpellsLikeAnIoCellWithoutTheImportEdge',
      code: `${CELL_IMPORT}
const store = { save: (id) => id }
const description = Cell.decode((raw) => store.save(raw.id))`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_PhaseCallObjectIsNotAnImportBinding',
      code: `${CELL_IMPORT}
const Other = Cell
const description = Other.decode((raw) => raw)`,
      filename: 'confirm-order.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_IoCellCall_When_PurePhaseBodyCallsIt',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
const description = pipe(
  Cell.read((cmd) => Effect.succeed(cmd)),
  Cell.decode((raw) => Either.right({ id: findOrderRow(raw.id) })),
  Cell.decide((decoded) => Either.right(decoded)),
  Cell.encode((outcome) => outcome),
  Cell.write((outcome) => Effect.succeed(outcome)),
)`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      name: 'Should_Report_IoSourceCall_When_PurePhaseBodyCallsIt',
      code: `${CELL_IMPORT}
${CLOCK_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
const description = pipe(
  Cell.read((cmd) => Effect.succeed(cmd)),
  Cell.decode((raw) => Either.right(raw)),
  Cell.decide((decoded) => Either.right(Clock.currentTimeMillis())),
  Cell.encode((outcome) => outcome),
  Cell.write((outcome) => Effect.succeed(outcome)),
)`,
      filename: 'confirm-order.executor.ts',
      errors: [error('Clock')],
    },
    {
      name: 'Should_Report_IoCallInsideLocalHelper_When_PurePhaseCallsTheHelper',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
const loadRow = (id) => findOrderRow(id)
const description = pipe(
  Cell.read((cmd) => Effect.succeed(cmd)),
  Cell.decode((raw) => Either.right(loadRow(raw.id))),
  Cell.decide((decoded) => Either.right(decoded)),
  Cell.encode((outcome) => outcome),
  Cell.write((outcome) => Effect.succeed(outcome)),
)`,
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
${EITHER_IMPORT}
export const loadRow = (id) => findOrderRow(id)
const description = Cell.decode((raw) => Either.right(loadRow(raw.id)))`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      name: 'Should_Report_IoCellCall_When_DescriptionNamespaceImported',
      code: `import * as Description from '@systemfsoftware/effect-cell-types'
${STORE_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
const description = pipe(
  Description.read((cmd) => Effect.succeed(cmd)),
  Description.decode((raw) => Either.right({ id: findOrderRow(raw.id) })),
  Description.decide((decoded) => Either.right(decoded)),
  Description.encode((outcome) => outcome),
  Description.write((outcome) => Effect.succeed(outcome)),
)`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      name: 'Should_Report_IoCellCall_When_PhaseBodyIsTheCallItself',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
const description = Cell.decode((raw) => findOrderRow(raw))`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      name: 'Should_Report_IoCellCall_When_CellIsTheLastWalkedEntry',
      code: `${CELL_IMPORT}
${LAST_CELL_IMPORT}
${EITHER_IMPORT}
const description = Cell.decode((raw) => Either.right(loadRow(raw)))`,
      filename: 'confirm-order.executor.ts',
      errors: [error('loadRow')],
    },
    {
      name: 'Should_Report_IoSourceCall_When_SourceIsTheLastWalkedEntry',
      code: `${CELL_IMPORT}
${LAST_SOURCE_IMPORT}
${EITHER_IMPORT}
const description = Cell.decode((raw) => Either.right(Io.read(raw)))`,
      filename: 'confirm-order.executor.ts',
      errors: [error('Io')],
    },
    {
      // The import sits below the call. Listeners fire in document order, so a rule that
      // registered its I/O names from an `ImportDeclaration` listener judged this call against
      // empty sets and reported nothing — a silent pass decided by line order.
      name: 'Should_Report_IoCellCall_When_ImportFollowsThePhaseCall',
      code: `${CELL_IMPORT}
${EITHER_IMPORT}
const description = Cell.decode((raw) => Either.right(findOrderRow(raw)))
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
${EITHER_IMPORT}
const transform = (raw) => Either.right(findOrderRow(raw))
const description = Cell.decode(transform)`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      // The form every production call site actually uses: the phase is reached through an
      // explicit type argument. Without this case the whole suite exercises only the bare
      // call, and a rule that stopped resolving `Cell.decode<Phases>(...)` would still be
      // green while reporting nothing in `supervisor-body.executor.ts` or
      // `run-hooks-for-event.executor.ts`.
      name: 'Should_Report_IoCellCall_When_PhaseIsCalledWithATypeArgument',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
interface Phases extends Cell.Phases {
  readonly raw: { readonly id: string }
}
const description = Cell.decode<Phases>((raw) => findOrderRow(raw.id))`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      // A helper written as a `function` declaration rather than an arrow. Nothing else in the
      // suite reaches that branch of the top-level scan.
      name: 'Should_Report_IoCallInsideHelper_When_HelperIsAFunctionDeclaration',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
${EITHER_IMPORT}
function loadRow(id) {
  return findOrderRow(id)
}
const description = Cell.decode((raw) => Either.right(loadRow(raw.id)))`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      // `export default function` — the other wrapper a helper stays callable through.
      name: 'Should_Report_IoCallInsideHelper_When_HelperIsDefaultExported',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
${EITHER_IMPORT}
export default function loadRow(id) {
  return findOrderRow(id)
}
const description = Cell.decode((raw) => Either.right(loadRow(raw.id)))`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      // A helper bound to a `function` expression rather than an arrow.
      name: 'Should_Report_IoCallInsideHelper_When_HelperIsAFunctionExpression',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
${EITHER_IMPORT}
const loadRow = function (id) {
  return findOrderRow(id)
}
const description = Cell.decode((raw) => Either.right(loadRow(raw.id)))`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
    {
      // The phase body itself written as a `function` expression, not an arrow.
      name: 'Should_Report_IoCellCall_When_PhaseBodyIsAFunctionExpression',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
const description = Cell.decode(function (raw) {
  return findOrderRow(raw)
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
${EITHER_IMPORT}
const loadRow = (id) => (id > 0 ? loadRow(id - 1) : Either.right(findOrderRow(id)))
const description = Cell.decode(loadRow)`,
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
${EITHER_IMPORT}
const description = Cell.decode((raw) => {
  const unused = () => findOrderRow(raw.id)
  return Either.right(raw)
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('findOrderRow')],
    },
  ],
})
