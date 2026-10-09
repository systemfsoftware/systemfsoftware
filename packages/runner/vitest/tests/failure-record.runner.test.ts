/**
 * The failure record's own suite: the text a spec failure prints, rendered from the failure and the spans its
 * run recorded through the fork's in-memory recorder (R1-R8, KTD1, KTD2, KTD5, KTD6).
 *
 * Every span here is produced by a real `Effect.withSpan` under the real recorder, never by a hand-made span
 * object, so the attribute names and the parent chain the record reads are the ones production writes. Each
 * lane pins the whole record by equality: the ordering rules (raising frame first, trail up to the failing step,
 * decision lines under their step, rerun last) are the contract.
 *
 * The fork is a runner-driving package, so this is a plain Vitest suite registered on the fork's own `it`.
 */
import { it } from '@systemfsoftware/vitest'
import {
  type AttributeValue,
  createSpanRecorder,
  type FailureRecord,
  renderFailureRecord,
  type ReplayValue,
  summaryOf,
  type TestIdentity,
} from '@systemfsoftware/vitest/failure'
import { Cause, Effect, Exit } from 'effect'

const IDENTITY: TestIdentity = {
  package: '@systemfsoftware/vitest',
  file: 'packages/runner/vitest/tests/failure-record.test.ts',
  name: 'readiness is checked for connection acceptance',
}

const RERUN =
  '  pnpm --filter @systemfsoftware/vitest exec vitest run packages/runner/vitest/tests/failure-record.test.ts ' +
  '-t "readiness is checked for connection acceptance"'

/** The sites a spec records: absolute at the span, repo-relative (less the column) in the record. */
const SPEC_GIVEN = '/repo/packages/effect-readiness/tests/polling-readiness.integration.test.ts:26:9'
const SPEC_WHEN = '/repo/packages/effect-readiness/tests/polling-readiness.integration.test.ts:27:9'
const SPEC_THEN = '/repo/packages/effect-readiness/tests/polling-readiness.integration.test.ts:28:9'
const SPEC_GIVEN_TEXT = 'packages/effect-readiness/tests/polling-readiness.integration.test.ts:26'
const SPEC_WHEN_TEXT = 'packages/effect-readiness/tests/polling-readiness.integration.test.ts:27'
const HANDLER_SITE = '/repo/packages/effect-readiness/src/await-condition.cell.ts:21:5'
const HANDLER_TEXT = 'packages/effect-readiness/src/await-condition.cell.ts:21'
const CELL_SITE = '/repo/packages/effect-readiness/src/await-condition.cell.ts:16:11'
const CELL_TEXT = 'packages/effect-readiness/src/await-condition.cell.ts:16'
const DECIDE_SITE = '/repo/packages/effect-readiness/src/resolve-probe.workflow.ts:58:7'
const DECIDE_TEXT = 'packages/effect-readiness/src/resolve-probe.workflow.ts:58'
const LIBRARY_FRAME = '/repo/packages/gherkin/effect-gherkin-spec/src/DoNotation.ts:160:3'

const PROBE_CELL = 'probe_condition_resolve'
const STEP_KIND = 'gherkin.step'
const WHEN_TEXT = 'readiness is checked for connection acceptance'
const FAILING_STEP_LINE = `Failing step: When ${WHEN_TEXT}   ${SPEC_WHEN_TEXT}`
const FAILED_STEP_LINE = `  ✗ When ${WHEN_TEXT}   ${SPEC_WHEN_TEXT}`
const GIVEN_STEP_LINE = '  ✓ Given a guest service that accepts connections on its mapped port   ' + SPEC_GIVEN_TEXT

const stepAttributes = (keyword: string, text: string, site: string): Record<string, AttributeValue> => ({
  'gherkin.keyword': keyword,
  'gherkin.text': text,
  'code.site': site,
})

const stackAt = (site: string): string => `Error\n    at run (${site})`

const cellAttributes = (extra?: Record<string, AttributeValue>): Record<string, AttributeValue> => ({
  'cell.name': PROBE_CELL,
  'cell.stacktrace': stackAt(CELL_SITE),
  'cell.decide_stacktrace': stackAt(DECIDE_SITE),
  'cell.command_tag': 'ResolveProbe',
  'cell.member_tags': { condition: 'Tcp' },
  'cell.outcome': 'ProbeTcp',
  ...extra,
})

const givenStep = <A, E, R>(body: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.withSpan(STEP_KIND, {
    attributes: stepAttributes('given', 'a guest service that accepts connections on its mapped port', SPEC_GIVEN),
  })(body)

const whenStep = <A, E, R>(body: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.withSpan(STEP_KIND, { attributes: stepAttributes('when', WHEN_TEXT, SPEC_WHEN) })(body)

const thenStep = <A, E, R>(body: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.withSpan(STEP_KIND, { attributes: stepAttributes('then', 'the probe is awaited', SPEC_THEN) })(body)

const probeCell = <A, E, R>(
  body: Effect.Effect<A, E, R>,
  extra?: Record<string, AttributeValue>,
): Effect.Effect<A, E, R> => Effect.withSpan(PROBE_CELL, { attributes: cellAttributes(extra) })(body)

const frameLine = (fn: string, frame: string): string => `    at ${fn} (${frame})`

const raised = (message: string, stack?: string): Error => {
  const error = Object.assign(new Error(message), { _tag: 'LogSourceError' })
  error.stack = stack ?? `LogSourceError: ${message}\n${frameLine('write', HANDLER_SITE)}`
  return error
}

const bare = (stack?: string): Error => {
  const error = Object.assign(new Error(''), { _tag: 'LogSourceError', source: 'host 127.0.0.1:1' })
  error.stack = stack ?? `LogSourceError\n${frameLine('write', HANDLER_SITE)}`
  return error
}

/** The cause of the last program that failed; an empty cause when none did. */
const failureOf = <E>(exits: ReadonlyArray<Exit.Exit<void, E>>): Cause.Cause<E> =>
  lastCauseOf(exits.filter(Exit.isFailure))

const lastCauseOf = <E>(exits: ReadonlyArray<Exit.Failure<void, E>>): Cause.Cause<E> => {
  const last = exits.at(-1)
  return last === undefined ? Cause.empty : last.cause
}

/** The record a run of `programs` renders, with its failure drawn from the last program that failed. */
const recordOf = <E>(
  programs: ReadonlyArray<Effect.Effect<void, E, never>>,
  replay?: ReplayValue,
  identity?: TestIdentity,
): Effect.Effect<FailureRecord, never, never> =>
  Effect.gen(function*() {
    const recorder = createSpanRecorder()
    const exits = yield* Effect.forEach(programs, (program) => Effect.exit(Effect.withTracer(program, recorder.tracer)))
    return renderFailureRecord({
      failure: failureOf(exits),
      spans: recorder.spans,
      identity: identity ?? IDENTITY,
      replay,
      root: '/repo',
    })
  })

it('Should_LeadWithTheRaisingFrame_When_TheFailureWasRaisedInUserCode', function*({ expect }) {
  const record = yield* recordOf([whenStep(Effect.fail(raised('log source "host 127.0.0.1:1" failed')))])
  yield* expect(record).toEqual({
    name: 'LogSourceError',
    record: [
      'LogSourceError: log source "host 127.0.0.1:1" failed',
      `  raised at ${HANDLER_TEXT} (write)`,
      FAILING_STEP_LINE,
      '',
      'Steps and the decisions each caused:',
      FAILED_STEP_LINE,
      '',
      'Rerun only this scenario:',
      RERUN,
    ].join('\n'),
    breaches: [],
  })
})

it('Should_OmitTheFrameName_When_EffectsRuntimeNamedTheCallback', function*({ expect }) {
  const stack = `LogSourceError: boom\n${frameLine('OnSuccessImpl.~effect/Effect/successCont', HANDLER_SITE)}`
  const record = yield* recordOf([whenStep(Effect.fail(raised('boom', stack)))])
  yield* expect(record.record.split('\n').slice(0, 2)).toEqual(['LogSourceError: boom', `  raised at ${HANDLER_TEXT}`])
})

it('Should_RenderTagAndFields_When_TheTaggedErrorHasNoMessage', function*({ expect }) {
  const record = yield* recordOf([whenStep(Effect.fail(bare()))])
  yield* expect(record).toEqual({
    name: 'LogSourceError',
    record: [
      'LogSourceError {"source":"host 127.0.0.1:1"}',
      `  raised at ${HANDLER_TEXT} (write)`,
      FAILING_STEP_LINE,
      '',
      'Steps and the decisions each caused:',
      FAILED_STEP_LINE,
      '',
      'Rerun only this scenario:',
      RERUN,
    ].join('\n'),
    breaches: [],
  })
})

it('Should_PrintAbsolutePaths_When_NoWorkspaceRootIsProvided', function*({ expect }) {
  const recorder = createSpanRecorder()
  const exit = yield* Effect.exit(
    Effect.withTracer(whenStep(Effect.fail(raised('log source failed'))), recorder.tracer),
  )
  const record = renderFailureRecord({
    failure: failureOf([exit]),
    spans: recorder.spans,
    identity: IDENTITY,
    replay: undefined,
  })
  yield* expect(record.record.split('\n').slice(0, 2)).toEqual([
    'LogSourceError: log source failed',
    `  raised at ${HANDLER_SITE.replace(/:\d+$/u, '')} (write)`,
  ])
})

it('Should_FallBackToTheInnermostFailedSpanSite_When_TheStackHoldsOnlyLibraryFrames', function*({ expect }) {
  const library = Object.assign(new Error('probe absent'), { _tag: 'ProbeMissing' })
  library.stack = `ProbeMissing: probe absent\n${frameLine('stepWrap', LIBRARY_FRAME)}`
  const record = yield* recordOf([probeCell(Effect.fail(library))])
  yield* expect(record).toEqual({
    name: 'ProbeMissing',
    record: [
      'ProbeMissing: probe absent',
      `  raised at ${CELL_TEXT}`,
      `Failing step: no step ran (cell ${PROBE_CELL})`,
      '',
      'Rerun only this scenario:',
      RERUN,
    ].join('\n'),
    breaches: [],
  })
})

it('Should_StopTheTrailAtTheFailingStep_When_TheThirdStepAlsoRan', function*({ expect }) {
  const record = yield* recordOf([
    givenStep(Effect.void),
    whenStep(Effect.fail(raised('log source "host 127.0.0.1:1" failed'))),
    thenStep(Effect.void),
  ])
  yield* expect(record).toEqual({
    name: 'LogSourceError',
    record: [
      'LogSourceError: log source "host 127.0.0.1:1" failed',
      `  raised at ${HANDLER_TEXT} (write)`,
      FAILING_STEP_LINE,
      '',
      'Steps and the decisions each caused:',
      GIVEN_STEP_LINE,
      FAILED_STEP_LINE,
      '',
      'Rerun only this scenario:',
      RERUN,
    ].join('\n'),
    breaches: [],
  })
})

it('Should_CollapseRepeats_When_FiveIdenticalDecisionsRan', function*({ expect }) {
  const record = yield* recordOf([
    givenStep(Effect.forEach([1, 2, 3, 4, 5], () => probeCell(Effect.void))),
    whenStep(Effect.fail(raised('log source "host 127.0.0.1:1" failed'))),
  ])
  yield* expect(record).toEqual({
    name: 'LogSourceError',
    record: [
      'LogSourceError: log source "host 127.0.0.1:1" failed',
      `  raised at ${HANDLER_TEXT} (write)`,
      FAILING_STEP_LINE,
      '',
      'Steps and the decisions each caused:',
      GIVEN_STEP_LINE,
      `      cell ${PROBE_CELL}: ResolveProbe {"condition":"Tcp"} → ProbeTcp  (×5)`,
      `        decide ${DECIDE_TEXT}   cell ${CELL_TEXT}`,
      FAILED_STEP_LINE,
      '',
      'Rerun only this scenario:',
      RERUN,
    ].join('\n'),
    breaches: [],
  })
})

it('Should_ShowOnlyDeclaredData_When_TheCommandCarriesAnUndeclaredField', function*({ expect }) {
  const record = yield* recordOf([
    givenStep(
      probeCell(Effect.void, {
        'cell.declared': { attempts: 2 },
        [`app.${PROBE_CELL}.command`]: { hostPort: 1 },
      }),
    ),
    whenStep(Effect.fail(raised('log source "host 127.0.0.1:1" failed'))),
  ])
  yield* expect(record).toEqual({
    name: 'LogSourceError',
    record: [
      'LogSourceError: log source "host 127.0.0.1:1" failed',
      `  raised at ${HANDLER_TEXT} (write)`,
      FAILING_STEP_LINE,
      '',
      'Steps and the decisions each caused:',
      GIVEN_STEP_LINE,
      `      cell ${PROBE_CELL}: ResolveProbe {"condition":"Tcp","attempts":2} → ProbeTcp`,
      `        decide ${DECIDE_TEXT}   cell ${CELL_TEXT}`,
      FAILED_STEP_LINE,
      '',
      'Rerun only this scenario:',
      RERUN,
    ].join('\n'),
    breaches: [],
  })
})

it('Should_CarryTheSeedAndPath_When_TheRunWasSeeded', function*({ expect }) {
  const record = yield* recordOf(
    [whenStep(Effect.fail(raised('log source "host 127.0.0.1:1" failed')))],
    { seed: 7, path: [1, 2, 3] },
  )
  yield* expect(record).toEqual({
    name: 'LogSourceError',
    record: [
      'LogSourceError: log source "host 127.0.0.1:1" failed',
      `  raised at ${HANDLER_TEXT} (write)`,
      FAILING_STEP_LINE,
      '',
      'Steps and the decisions each caused:',
      FAILED_STEP_LINE,
      '',
      'Rerun only this scenario:',
      '  CONFORMANCE_REPLAY="seed=7;path=1,2,3" pnpm --filter @systemfsoftware/vitest exec vitest run ' +
      'packages/runner/vitest/tests/failure-record.test.ts -t "readiness is checked for connection acceptance"',
    ].join('\n'),
    breaches: [],
  })
})

it('Should_BreachR6_When_OnlyAPathWasOffered', function*({ expect }) {
  const record = yield* recordOf(
    [whenStep(Effect.fail(raised('log source "host 127.0.0.1:1" failed')))],
    { seed: undefined, path: [0, 0, 0] },
  )
  yield* expect(record).toEqual({
    name: 'LogSourceError',
    record: [
      'LogSourceError: log source "host 127.0.0.1:1" failed',
      `  raised at ${HANDLER_TEXT} (write)`,
      FAILING_STEP_LINE,
      '',
      'Steps and the decisions each caused:',
      FAILED_STEP_LINE,
      '',
      'Rerun only this scenario:',
      RERUN,
    ].join('\n'),
    breaches: ['R6'],
  })
})

it('Should_BreachR1_When_TheHeadlineIsEmpty', function*({ expect }) {
  const record = yield* recordOf([Effect.fail('')])
  yield* expect(record).toEqual({
    name: 'Error',
    record: ['', 'Failing step: no step ran', '', 'Rerun only this scenario:', RERUN].join('\n'),
    breaches: ['R1', 'R2'],
  })
})

it('Should_RenderEveryLayer_When_TheEntryEmbedsAMessageLessCause', function*({ expect }) {
  const inner = bare()
  const message = `When "${WHEN_TEXT}" failed: LogSourceError {"source":"host 127.0.0.1:1"}`
  const entry = Object.assign(new Error(message), { _tag: 'StepError', cause: inner })
  entry.stack = `StepError: ${message}\n${frameLine('When', SPEC_WHEN)}`
  const record = yield* recordOf([whenStep(Effect.fail(entry))])
  yield* expect(record).toEqual({
    name: 'StepError',
    record: [
      `StepError: ${message}`,
      `  raised at ${HANDLER_TEXT} (write)`,
      FAILING_STEP_LINE,
      '',
      'Cause chain:',
      '  LogSourceError {"source":"host 127.0.0.1:1"}',
      '',
      'Steps and the decisions each caused:',
      FAILED_STEP_LINE,
      '',
      'Rerun only this scenario:',
      RERUN,
    ].join('\n'),
    breaches: [],
  })
})

it('Should_BreachR2_When_NoLocationSurvives', function*({ expect }) {
  const record = yield* recordOf([Effect.fail({ _tag: 'ScenarioBuildError', field: 1 })])
  yield* expect(record).toEqual({
    name: 'ScenarioBuildError',
    record: ['ScenarioBuildError {"field":1}', 'Failing step: no step ran', '', 'Rerun only this scenario:', RERUN]
      .join('\n'),
    breaches: ['R2'],
  })
})

it('Should_BreachR6_When_TheIdentityIsIncomplete', function*({ expect }) {
  const record = yield* recordOf([whenStep(Effect.fail(raised('log source "host 127.0.0.1:1" failed')))], undefined, {
    package: '',
    file: '',
    name: '',
  })
  yield* expect(record).toEqual({
    name: 'LogSourceError',
    record: [
      'LogSourceError: log source "host 127.0.0.1:1" failed',
      `  raised at ${HANDLER_TEXT} (write)`,
      FAILING_STEP_LINE,
      '',
      'Steps and the decisions each caused:',
      FAILED_STEP_LINE,
    ].join('\n'),
    breaches: ['R6'],
  })
})

it('Should_BreachR1_When_NoCauseLayerSurvives', function*({ expect }) {
  const record = renderFailureRecord({ failure: Cause.empty, spans: [], identity: IDENTITY, replay: undefined })
  yield* expect(record).toEqual({
    name: 'Error',
    record: ['', 'Failing step: no step ran', '', 'Rerun only this scenario:', RERUN].join('\n'),
    breaches: ['R1', 'R2'],
  })
})

it('Should_WalkTheEffectCause_When_TheCauseFieldHoldsACause', function*({ expect }) {
  const boom = Object.assign(new Error('boom'), { _tag: 'LogSourceError' })
  boom.stack = `LogSourceError: boom\n${frameLine('write', HANDLER_SITE)}`
  const entry = Object.assign(new Error('the supervisor terminated'), {
    _tag: 'SupervisorTerminated',
    cause: Cause.die(boom),
  })
  entry.stack = `SupervisorTerminated: the supervisor terminated\n${frameLine('stop', HANDLER_SITE)}`
  const record = yield* recordOf([whenStep(Effect.fail(entry))])
  yield* expect(record).toEqual({
    name: 'SupervisorTerminated',
    record: [
      'SupervisorTerminated: the supervisor terminated',
      `  raised at ${HANDLER_TEXT} (write)`,
      FAILING_STEP_LINE,
      '',
      'Cause chain:',
      '  LogSourceError: boom',
      '',
      'Steps and the decisions each caused:',
      FAILED_STEP_LINE,
      '',
      'Rerun only this scenario:',
      RERUN,
    ].join('\n'),
    breaches: [],
  })
})

it('Should_RenderTheInterruptLayer_When_TheCauseWasInterrupted', function*({ expect }) {
  const entry = Object.assign(new Error('the supervisor terminated'), {
    _tag: 'SupervisorTerminated',
    cause: Cause.interrupt(7),
  })
  entry.stack = `SupervisorTerminated: the supervisor terminated\n${frameLine('stop', HANDLER_SITE)}`
  const record = yield* recordOf([whenStep(Effect.fail(entry))])
  yield* expect({
    interrupted: record.record.includes('interrupted by fiber #7'),
    effectCause: record.record.includes('~effect/Cause'),
  }).toEqual({ interrupted: true, effectCause: false })
})

it('Should_RenderAnUntaggedObjectAsItsOwnRecord_When_TheValueIsNotAnError', function*({ expect }) {
  yield* expect(summaryOf({ length: 2 })).toEqual('{"length":2}')
})

it('Should_RenderAListAsItsElements_When_TheValueIsAnArray', function*({ expect }) {
  yield* expect(summaryOf([1, 2])).toEqual('[1,2]')
})

it('Should_NameAnErrorWithItsOneLineMessage_When_TheValueIsAnError', function*({ expect }) {
  const error = new Error('first line\nsecond line')
  error.name = 'Slop'
  yield* expect(summaryOf(error)).toEqual('Slop: first line')
})

it('Should_RenderTagAndFields_When_TheTaggedValueHasNoMessage', function*({ expect }) {
  yield* expect(summaryOf({ _tag: 'AccessDenied', user: 'bob' })).toEqual('AccessDenied {"user":"bob"}')
})

it('Should_QuoteTextAndKeepAnEmptyStringEmpty_When_TheValueIsAString', function*({ expect }) {
  yield* expect({ text: summaryOf('text'), empty: summaryOf('') }).toEqual({ text: '"text"', empty: '' })
})

it('Should_RenderScalars_When_TheValueIsABigIntNullOrUndefined', function*({ expect }) {
  yield* expect({ bigint: summaryOf(7n), nullish: summaryOf(null), absent: summaryOf(undefined) }).toEqual({
    bigint: '7n',
    nullish: 'null',
    absent: 'undefined',
  })
})

it('Should_KeepTheWholeCauseMessage_When_TheChainLayerHasThreeLines', function*({ expect }) {
  const inner = new Error('first line of the cause\nsecond line of the cause\nthird line of the cause')
  inner.name = 'Slop'
  inner.stack = `Slop: first line of the cause\n${frameLine('write', HANDLER_SITE)}`
  const entry = Object.assign(new Error('When "x" failed: Slop: first line of the cause'), {
    _tag: 'StepError',
    cause: inner,
  })
  entry.stack = `StepError: ${entry.message}\n${frameLine('When', SPEC_WHEN)}`
  const record = yield* recordOf([whenStep(Effect.fail(entry))])
  const block = [
    'Cause chain:',
    '  Slop: first line of the cause',
    '    second line of the cause',
    '    third line of the cause',
  ].join('\n')
  yield* expect(record.record).toSatisfy(
    (text) => text.includes(block),
    'the whole cause message survives under Cause chain:',
  )
})
