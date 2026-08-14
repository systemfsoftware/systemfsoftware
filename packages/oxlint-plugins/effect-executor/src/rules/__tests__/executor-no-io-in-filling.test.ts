import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { executorNoIoInFilling } from '../executor-no-io-in-filling.js'

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

const CELL_IMPORT = `import { Cell } from '@systemfsoftware/effect-cell-types'`
const STORE_IMPORT = `import { findOrderRow } from './order.store.js'`
const ADAPTER_IMPORT = `import { capture } from './payment.adapter.js'`
const CLOCK_IMPORT = `import * as Clock from 'effect/Clock'`
const EFFECT_IMPORT = `import * as Effect from 'effect/Effect'`
const EITHER_IMPORT = `import * as Either from 'effect/Either'`
const PIPE_IMPORT = `import { pipe } from 'effect/Function'`

const error = (actual: string, name: string) =>
  ({
    messageId: 'ioInPurePhase',
    data: {
      name,
      expected: 'a pure phase body that only transforms its input',
      actual,
      fix:
        "hoist the I/O into the description's read or write phase and pass the value in; a pure phase body must only transform the value it receives",
    },
  }) as const

const IO_CALL = 'an I/O call inside a pure phase body'

ruleTester.run('executor-no-io-in-filling', executorNoIoInFilling, {
  valid: [
    {
      name: 'Should_ReportNothing_PurePhaseBody_When_OnlyTransformsItsInput',
      code: `${CELL_IMPORT}
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
)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_ImpurePhaseBody_When_PerformingIo',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
const description = pipe(
  Cell.read((cmd) => findOrderRow(cmd.id)),
  Cell.decode((raw) => Either.right(raw)),
  Cell.decide((decoded) => Either.right(decoded)),
  Cell.encode((outcome) => outcome),
  Cell.write((outcome) => Effect.sync(() => findOrderRow(outcome.decision.id))),
)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_StoreCall_When_OutsidePhaseBodies',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
const row = findOrderRow(id)
const description = pipe(
  Cell.read((cmd) => Effect.succeed(row)),
  Cell.decode((raw) => Either.right(raw)),
  Cell.decide((decoded) => Either.right(decoded)),
  Cell.encode((outcome) => outcome),
  Cell.write((outcome) => Effect.succeed(outcome)),
)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_WorkflowCall_When_InPurePhaseBody',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
import { decideRestart } from './restart-decision.workflow.js'
const description = pipe(
  Cell.read((cmd) => Effect.succeed(cmd)),
  Cell.decode((raw) => Either.right(raw)),
  Cell.decide((decoded) => Either.map(decideRestart(decoded), (decision) => decision)),
  Cell.encode((outcome) => outcome),
  Cell.write((outcome) => Effect.succeed(outcome)),
)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_AclCall_When_InPurePhaseBody',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
import { decodeOrder } from './order.acl.js'
const description = pipe(
  Cell.read((cmd) => Effect.succeed(cmd)),
  Cell.decode((raw) => decodeOrder(raw)),
  Cell.decide((decoded) => Either.right(decoded)),
  Cell.encode((outcome) => outcome),
  Cell.write((outcome) => Effect.succeed(outcome)),
)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_NamedFunctionBody_When_BodyIsNotWalkable',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
const decide = (decoded) => Either.right(decoded)
const description = pipe(
  Cell.read((cmd) => Effect.succeed(cmd)),
  Cell.decode((raw) => Either.right(raw)),
  Cell.decide(decide),
  Cell.encode((outcome) => outcome),
  Cell.write((outcome) => Effect.succeed(outcome)),
)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_StoreCallInPurePhase_When_HandlerFile',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
const description = pipe(
  Cell.read((cmd) => Effect.succeed(cmd)),
  Cell.decode((raw) => Either.right(raw)),
  Cell.decide((decoded) => Either.right(findOrderRow(decoded.id))),
  Cell.encode((outcome) => outcome),
  Cell.write((outcome) => Effect.succeed(outcome)),
)`,
      filename: 'confirm-order.handler.ts',
    },
    {
      name: 'Should_ReportNothing_LocalDecode_When_NamespaceNotImported',
      code: `${STORE_IMPORT}
const decode = (raw) => findOrderRow(raw.id)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_PhaseNamedMember_When_ObjectNotFromDescriptionSource',
      code: `${STORE_IMPORT}
const something = {}
const description = something.decode((decoded) => Either.right(findOrderRow(decoded.id)))`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_PhaseNamedMember_When_ImportIsNotTheCellNamespace',
      code: `import { Policy } from '@systemfsoftware/effect-cell-types'
${STORE_IMPORT}
const description = Policy.decide((decoded) => Either.right(findOrderRow(decoded.id)))`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_NewExpression_When_ConstructorIsIoImported',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
import * as Store from './order.store.js'
const description = pipe(
  Cell.read((cmd) => Effect.succeed(cmd)),
  Cell.decide((decoded) => Either.right(new Store.Row(decoded.id))),
  Cell.write((outcome) => Effect.succeed(outcome)),
)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_InlineReadStage_When_DataLastPhaseCall',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
const description = Cell.decode(Cell.read((cmd) => findOrderRow(cmd.id)), (raw) => Either.right(raw))`,
      filename: 'confirm-order.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_CapturedStoreCall_When_InDecideBody',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
const description = pipe(
  Cell.read((cmd) => Effect.succeed(cmd)),
  Cell.decide((decoded) => {
    const row = findOrderRow(decoded.id)
    return Either.right({ ...decoded, row })
  }),
  Cell.write((outcome) => Effect.succeed(outcome)),
)`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          ...error(IO_CALL, 'findOrderRow'),
          line: 9,
        },
      ],
    },
    {
      name: 'Should_Report_CapturedClockCall_When_InDecodeBody',
      code: `${CELL_IMPORT}
${CLOCK_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
const description = pipe(
  Cell.read((cmd) => Effect.succeed(cmd)),
  Cell.decode((raw) => Either.right({ ...raw, at: Clock.currentTimeMillis() })),
  Cell.decide((decoded) => Either.right(decoded)),
  Cell.encode((outcome) => outcome),
  Cell.write((outcome) => Effect.succeed(outcome)),
)`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          ...error(IO_CALL, 'Clock'),
          line: 8,
        },
      ],
    },
    {
      name: 'Should_Report_AdapterCall_When_InEncodeBody',
      code: `${CELL_IMPORT}
${ADAPTER_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
const description = pipe(
  Cell.read((cmd) => Effect.succeed(cmd)),
  Cell.decode((raw) => Either.right(raw)),
  Cell.decide((decoded) => Either.right(decoded)),
  Cell.encode((outcome) => ({ ...outcome, captured: capture(outcome.decision) })),
  Cell.write((outcome) => Effect.succeed(outcome)),
)`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          ...error(IO_CALL, 'capture'),
          line: 10,
        },
      ],
    },
    {
      name: 'Should_Report_NamespaceStoreCall_When_InPurePhaseBody',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
import * as Store from './order.store.js'
const description = pipe(
  Cell.read((cmd) => Effect.succeed(cmd)),
  Cell.decide((decoded) => Either.right(Store.findOrderRow(decoded.id))),
  Cell.write((outcome) => Effect.succeed(outcome)),
)`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          ...error(IO_CALL, 'Store'),
          line: 8,
        },
      ],
    },
    {
      name: 'Should_Report_StoreCall_When_PhaseCallIsDataLast',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
const description = pipe(
  Cell.read((cmd) => Effect.succeed(cmd)),
  Cell.decode((raw) => Either.right(raw)),
  Cell.decide(previous, (decoded) => Either.right(findOrderRow(decoded.id))),
  Cell.write((outcome) => Effect.succeed(outcome)),
)`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          ...error(IO_CALL, 'findOrderRow'),
          line: 9,
        },
      ],
    },
    {
      name: 'Should_Report_EachIoCall_When_TwoInOnePhaseBody',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
${ADAPTER_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
const description = pipe(
  Cell.read((cmd) => Effect.succeed(cmd)),
  Cell.decide((decoded) =>
    Either.right({
      row: findOrderRow(decoded.id),
      captured: capture(decoded.total),
    }),
  ),
  Cell.write((outcome) => Effect.succeed(outcome)),
)`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          ...error(IO_CALL, 'findOrderRow'),
          line: 11,
        },
        {
          ...error(IO_CALL, 'capture'),
          line: 12,
        },
      ],
    },
    {
      name: 'Should_Report_StoreCall_When_NamespaceIsAliased',
      code: `import { Cell as Description } from '@systemfsoftware/effect-cell-types'
${STORE_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
const description = pipe(
  Description.read((cmd) => Effect.succeed(cmd)),
  Description.decide((decoded) => Either.right(findOrderRow(decoded.id))),
  Description.write((outcome) => Effect.succeed(outcome)),
)`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          ...error(IO_CALL, 'findOrderRow'),
          line: 8,
        },
      ],
    },
    {
      name: 'Should_Report_StoreCall_When_DescriptionNamespaceImported',
      code: `import * as Description from '@systemfsoftware/effect-cell-types'
${STORE_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
const description = pipe(
  Description.read((cmd) => Effect.succeed(cmd)),
  Description.decide((decoded) => Either.right(findOrderRow(decoded.id))),
  Description.write((outcome) => Effect.succeed(outcome)),
)`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          ...error(IO_CALL, 'findOrderRow'),
          line: 8,
        },
      ],
    },
    {
      name: 'Should_Report_CapturedSystemCall_When_InPurePhaseBody',
      code: `${CELL_IMPORT}
import * as System from 'effect/System'
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
const description = pipe(
  Cell.read((cmd) => Effect.succeed(cmd)),
  Cell.decide((decoded) => Either.right({ ...decoded, cwd: System.env('CWD') })),
  Cell.write((outcome) => Effect.succeed(outcome)),
)`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          ...error(IO_CALL, 'System'),
          line: 8,
        },
      ],
    },
    {
      name: 'Should_Report_StoreCall_When_BodyIsFunctionExpression',
      code: `${CELL_IMPORT}
${STORE_IMPORT}
${EFFECT_IMPORT}
${EITHER_IMPORT}
${PIPE_IMPORT}
const description = pipe(
  Cell.read((cmd) => Effect.succeed(cmd)),
  Cell.decide(function (decoded) {
    return Either.right(findOrderRow(decoded.id))
  }),
  Cell.write((outcome) => Effect.succeed(outcome)),
)`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          ...error(IO_CALL, 'findOrderRow'),
          line: 9,
        },
      ],
    },
  ],
})
