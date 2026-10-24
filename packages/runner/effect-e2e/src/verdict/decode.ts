import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Predicate from 'effect/Predicate'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { type FailureCode, FailureCode as FailureCodes, FailureError, FailureRecord } from './failure.schema.js'
import { StepRecord } from './step-record.schema.js'

export const decodeStepRecord = (input: Schema.Json): Effect.Effect<StepRecord, Schema.SchemaError> =>
  Schema.decodeUnknownEffect(StepRecord)(input)

interface Row {
  readonly [field: string]: Schema.Json
}

const without = (row: Row, key: string): Row =>
  Object.fromEntries(Object.entries(row).filter(([field]) => field !== key))

const logEvidence = (text: string): Row => ({ _tag: 'LogEvidence', text })

const saveButton: Row = {
  expression: { kind: 'ByRole', role: 'button', name: { value: 'Save', exact: true } },
  label: 'the Save button',
}

const checkRecordOf = (sentence: string): Row => ({
  sentence,
  check: { _tag: 'Present', locator: saveButton },
  evidence: [{ _tag: 'NodeEvidence', ref: { id: 'n1', revision: 'r1' } }],
  vision: false,
})

const failureRecordOf = (text: string): Row => ({
  code: 'ASSERTION_FAILED',
  cause: 'product',
  evidence: [logEvidence(text)],
})

const failedOutcomeOf = (text: string): Row => ({ _tag: 'Failed', ...failureRecordOf(text) })

const inconclusiveOutcomeOf = (text: string): Row => ({
  _tag: 'Inconclusive',
  code: 'ASSERTION_INCONCLUSIVE',
  evidence: [logEvidence(text)],
})

const actStepOf = (text: string): Row => ({
  _tag: 'ActStep',
  id: 'step-1',
  instruction: text,
  params: { email: 'ada@example.test' },
  actions: [{ action: { _tag: 'Tap', target: saveButton }, located: [{ id: 'n1', revision: 'r1' }] }],
  summary: text,
  outcome: { _tag: 'Passed' },
  cache: { lookup: { _tag: 'Replayed' }, write: 'kept' },
  modelCalls: 0,
  tokens: { input: 0, output: 0 },
})

const modelFacts: Row = {
  cache: { lookup: { _tag: 'Missed' }, write: 'unconfirmed' },
  modelCalls: 1,
  tokens: { input: 900, output: 40 },
}

const judgedStepOf = (text: string): Row => ({
  _tag: 'AssertStep',
  id: 'step-2',
  record: checkRecordOf(text),
  outcome: failedOutcomeOf(text),
  ...modelFacts,
})

const stepRowsOf = (text: string): ReadonlyArray<Row> => [
  actStepOf(text),
  judgedStepOf(text),
  {
    _tag: 'WaitForStep',
    id: 'step-3',
    record: checkRecordOf(text),
    outcome: inconclusiveOutcomeOf(text),
    ...modelFacts,
  },
  {
    _tag: 'ExtractStep',
    id: 'step-4',
    schemaId: 'Invoice',
    result: { total: 12, lines: [text] },
    outcome: { _tag: 'Passed' },
    cache: { lookup: { _tag: 'Off' }, write: 'no-change' },
    modelCalls: 1,
    tokens: { input: 700, output: 30 },
  },
  {
    _tag: 'LocatorStep',
    id: 'step-5',
    matcher: 'toBeVisible',
    expected: 'visible',
    observed: text,
    outcome: { _tag: 'Skipped', reason: text },
  },
  { _tag: 'ValueStep', id: 'step-6', matcher: 'toBe', expected: text, observed: text, outcome: { _tag: 'Passed' } },
]

const refusedStepRowsOf = (text: string): ReadonlyArray<Row> => [
  without(actStepOf(text), 'cache'),
  without(judgedStepOf(text), 'cache'),
  without(judgedStepOf(text), 'tokens'),
  without(judgedStepOf(text), 'record'),
  without({ ...judgedStepOf(text), _tag: 'WaitForStep' }, 'record'),
  { ...judgedStepOf(text), record: without(checkRecordOf(text), 'check') },
  { ...judgedStepOf(text), outcome: without(failedOutcomeOf(text), 'evidence') },
  { ...judgedStepOf(text), outcome: { ...failedOutcomeOf(text), evidence: [] } },
  { ...judgedStepOf(text), outcome: without(inconclusiveOutcomeOf(text), 'evidence') },
  { ...judgedStepOf(text), outcome: { ...inconclusiveOutcomeOf(text), evidence: [] } },
]

const failureRefusalsOf = (text: string): ReadonlyArray<Row> => [
  without(failureRecordOf(text), 'evidence'),
  { ...failureRecordOf(text), evidence: [] },
]

const stepRecordDecodes = (input: Row): boolean => decodeStepRecord(input).pipe(Effect.runSyncExit, Exit.isSuccess)

const failureRecordDecodes = (input: Row): boolean => Result.isSuccess(Schema.decodeUnknownResult(FailureRecord)(input))

const claimantsOf = (code: FailureCode, message: string): ReadonlyArray<number> =>
  Result.match(Schema.decodeUnknownResult(FailureError)({ _tag: code, message, evidence: [logEvidence(message)] }), {
    onFailure: () => [],
    onSuccess: (error) =>
      Predicate.isTagged(error, code)
        ? Arr.filterMap(FailureError.members, (member, index) =>
          error instanceof member ? Result.succeed(index) : Result.failVoid)
        : [],
  })

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as undefined, so a static import would ship the test runner.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀s_FailureCode_≡OwnTaggedError',
    { of: [Schema.String], subject: claimantsOf, runs: 100, arbitrary: { seed: 497_001 } },
    (subject, [message]) => {
      const claimants = FailureCodes.literals.map((code) => subject(code, message))
      return Arr.every(claimants, (claiming) => claiming.length === 1) &&
        new Set(claimants.flat()).size === FailureCodes.literals.length
    },
  )

  it.prop(
    '∀s_FailureRecord_≡RefusedWithoutEvidence',
    { of: [Schema.String], subject: failureRecordDecodes, runs: 100, arbitrary: { seed: 497_002 } },
    (subject, [text]) => subject(failureRecordOf(text)) && Arr.every(failureRefusalsOf(text), (row) => !subject(row)),
  )

  it.prop(
    '∀s_StepRecord_≡RefusesMissingCacheCheckOrEvidence',
    { of: [Schema.String], subject: stepRecordDecodes, runs: 100, arbitrary: { seed: 497_003 } },
    (subject, [text]) =>
      Arr.every(stepRowsOf(text), (row) => subject(row)) && Arr.every(refusedStepRowsOf(text), (row) => !subject(row)),
  )
}
