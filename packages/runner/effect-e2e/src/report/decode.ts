import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import * as SchemaIssue from 'effect/SchemaIssue'

import { report1JsonSchema } from './json-schema.js'
import { Report1 } from './report.schema.js'

export const decodeReport = (input: Schema.Json): Effect.Effect<Report1, Schema.SchemaError> =>
  Schema.decodeUnknownEffect(Report1)(input)

interface Row {
  readonly [field: string]: Schema.Json
}

type Steps = ReadonlyArray<ReadonlyArray<ReadonlyArray<Row>>>

type PathSegment = string | number

const without = (row: Row, key: string): Row =>
  Object.fromEntries(Object.entries(row).filter(([field]) => field !== key))

const saveButton: Row = {
  expression: { kind: 'ByRole', role: 'button', name: { value: 'Save', exact: true } },
  label: 'the Save button',
}

const emailField: Row = {
  expression: { kind: 'ByLabel', text: { value: 'Email', exact: true } },
  label: 'the Email field',
}

const located = [{ id: 'n7', revision: 'r3' }]

const checkRecordOf = (sentence: string): Row => ({
  sentence,
  check: {
    _tag: 'AllOf',
    checks: [
      { _tag: 'Present', locator: saveButton },
      { _tag: 'Not', check: { _tag: 'State', locator: saveButton, state: 'disabled', expected: true } },
    ],
  },
  evidence: [{ _tag: 'NodeEvidence', ref: { id: 'n7', revision: 'r3' } }],
  vision: false,
  resolvedBy: { provider: 'openrouter', model: 'anthropic/claude-sonnet' },
  resolvedAt: '2026-10-23T09:00:12.000Z',
})

const passedStepsOf = (text: string): ReadonlyArray<Row> => [
  {
    _tag: 'ActStep',
    id: 'step-1',
    instruction: text,
    params: { email: 'ada@example.test' },
    actions: [
      { action: { _tag: 'Fill', target: emailField, value: 'ada@example.test' }, located },
      { action: { _tag: 'Tap', target: saveButton }, located },
    ],
    summary: text,
    outcome: { _tag: 'Passed' },
    cache: { lookup: { _tag: 'Replayed' }, write: 'kept' },
    modelCalls: 0,
    tokens: { input: 0, output: 0 },
  },
  { _tag: 'AssertStep', id: 'step-2', record: checkRecordOf(text), outcome: { _tag: 'Passed' } },
  {
    _tag: 'WaitForStep',
    id: 'step-3',
    record: {
      sentence: text,
      check: { _tag: 'Text', locator: saveButton, match: { kind: 'contains', value: 'Saved' } },
      evidence: [],
      vision: true,
    },
    outcome: { _tag: 'Passed' },
  },
  {
    _tag: 'ExtractStep',
    id: 'step-4',
    schemaId: 'Invoice',
    result: { total: 12.5, lines: [text] },
    outcome: { _tag: 'Passed' },
  },
  {
    _tag: 'LocatorStep',
    id: 'step-5',
    matcher: 'toBeVisible',
    expected: 'visible',
    observed: 'visible',
    outcome: { _tag: 'Passed' },
  },
  {
    _tag: 'ValueStep',
    id: 'step-6',
    matcher: 'toBe',
    expected: '12.50',
    observed: '12.50',
    outcome: { _tag: 'Skipped', reason: text },
  },
]

const failedStepsOf = (text: string): ReadonlyArray<Row> => [
  {
    _tag: 'ActStep',
    id: 'step-1',
    instruction: text,
    params: {},
    actions: [{ action: { _tag: 'Fill', target: emailField, value: { secret: 'smtp_password' } }, located }],
    summary: text,
    outcome: { _tag: 'Passed' },
    cache: { lookup: { _tag: 'HandedOff', reason: 'target-not-found' }, write: 'saved' },
    modelCalls: 3,
    tokens: { input: 5120, output: 240 },
  },
  {
    _tag: 'AssertStep',
    id: 'step-2',
    record: checkRecordOf(text),
    outcome: {
      _tag: 'Failed',
      code: 'ASSERTION_FAILED',
      cause: 'product',
      evidence: [
        { _tag: 'ScreenshotEvidence', screenshot: { digest: 'sha256-9f2c' } },
        { _tag: 'RouteEvidence', route: { origin: 'https://staging.acme.test', path: '/settings', query: [] } },
      ],
      proposed: { cause: 'automation', evidence: [{ _tag: 'LogEvidence', text }] },
    },
  },
]

const stepsOf = (text: string): Steps => [[passedStepsOf(text)], [failedStepsOf(text), failedStepsOf(text)]]

const attemptOf = (steps: ReadonlyArray<Row>, retry: number, status: string): Row => ({
  id: `attempt-${retry}`,
  retry,
  status,
  steps,
})

interface ResultHead {
  readonly head: Row
  readonly status: string
}

const resultHeads: ReadonlyArray<ResultHead> = [
  {
    head: {
      test: 'tests/signup.e2e.ts > signs up',
      title: 'signs up',
      file: 'tests/signup.e2e.ts',
      target: 'staging',
      agent: 'default',
      cache: { replayed: 1, handedOff: 0, missed: 0 },
      artifacts: [],
    },
    status: 'passed',
  },
  {
    head: {
      test: 'tests/settings.e2e.ts > saves the profile',
      title: 'saves the profile',
      file: 'tests/settings.e2e.ts',
      target: 'staging',
      agent: 'default',
      cache: { replayed: 0, handedOff: 2, missed: 0 },
      artifacts: [
        { kind: 'screenshot', path: '.e2e/results/saves-the-profile/screen.png' },
        { kind: 'screen-text', path: '.e2e/results/saves-the-profile/screen.txt' },
        { kind: 'trace-page', path: '.e2e/results/saves-the-profile/trace.md' },
      ],
      tracePath: '.e2e/results/saves-the-profile/trace.md',
    },
    status: 'failed',
  },
]

const resultOf = (result: ResultHead, attempts: ReadonlyArray<ReadonlyArray<Row>>): Row => ({
  ...result.head,
  status: result.status,
  attempts: attempts.map((steps, retry) => attemptOf(steps, retry, result.status)),
})

const reportOf = (steps: Steps): Row => ({
  schema: 'report-1',
  run: {
    id: 'run-2026-10-23-0900',
    project: 'acme.web',
    status: 'failed',
    exitCode: 1,
    startedAt: '2026-10-23T09:00:00.000Z',
    finishedAt: '2026-10-23T09:01:30.000Z',
    errors: [],
  },
  results: Arr.zipWith(resultHeads, steps, resultOf),
  summary: {
    tests: 2,
    passed: 1,
    failed: 1,
    blocked: 0,
    error: 0,
    interrupted: 0,
    skipped: 0,
    cache: { replayed: 1, handedOff: 2, missed: 0 },
  },
})

const specReportOf = (text: string): Row => reportOf(stepsOf(text))

interface Removal {
  readonly report: Row
  readonly path: ReadonlyArray<PathSegment>
}

const replacedAt = (steps: Steps, at: string, step: Row): Steps =>
  steps.map((attempts, r) => attempts.map((rows, a) => rows.map((row, s) => ([r, a, s].join() === at ? step : row))))

const removalPathOf = (stepPath: ReadonlyArray<PathSegment>, field: string): ReadonlyArray<PathSegment> =>
  field === '_tag' ? stepPath : [...stepPath, field]

const removalsOf = (text: string): ReadonlyArray<Removal> => {
  const steps = stepsOf(text)
  return steps.flatMap((attempts, r) =>
    attempts.flatMap((rows, a) =>
      rows.flatMap((row, s) =>
        Object.keys(row).map((field) => ({
          report: reportOf(replacedAt(steps, [r, a, s].join(), without(row, field))),
          path: removalPathOf(['results', r, 'attempts', a, 'steps', s], field),
        }))
      )
    )
  )
}

const standardIssues = SchemaIssue.makeFormatterStandardSchemaV1()

type IssueSegment = PropertyKey | { readonly key: PropertyKey }

const keyOf = (segment: IssueSegment): PropertyKey => (typeof segment === 'object' ? segment.key : segment)

const segmentOf = (segment: IssueSegment): PathSegment => {
  const key = keyOf(segment)
  return typeof key === 'number' ? key : String(key)
}

const firstIssuePathOf = (error: Schema.SchemaError): ReadonlyArray<PathSegment> =>
  Arr.flatMap(Arr.take(standardIssues(error.issue).issues, 1), (issue) => (issue.path ?? []).map(segmentOf))

const refusalPathOf = (report: Row): Option.Option<ReadonlyArray<PathSegment>> =>
  Result.match(Schema.decodeUnknownResult(Report1)(report), {
    onFailure: (error) => error.pipe(firstIssuePathOf, Option.some),
    onSuccess: () => Option.none(),
  })

const pathText = (path: Option.Option<ReadonlyArray<PathSegment>>): string => JSON.stringify(Option.getOrNull(path))

const reportDecodes = (report: Row): boolean => decodeReport(report).pipe(Effect.runSyncExit, Exit.isSuccess)

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as undefined, so a static import would ship the test runner
  // and the JSON-Schema importer.
  const { it } = await import('@systemfsoftware/vitest')
  const { fromJsonSchemaDocument } = await import('effect/SchemaRepresentation')
  const shippedAccepts = Schema.is(fromJsonSchemaDocument(report1JsonSchema(), { patterns: 'apply' }))

  it.prop(
    '∀s_ReportStepField_≡RemovalRefusedAtItsPath',
    { of: [Schema.String], subject: refusalPathOf, runs: 100, arbitrary: { seed: 497_004 } },
    (subject, [text]) =>
      Option.isNone(subject(specReportOf(text))) &&
      Arr.every(removalsOf(text), (removal) =>
        pathText(subject(removal.report)) === pathText(Option.some(removal.path))),
  )

  it.prop(
    '∀s_ShippedJsonSchema_≡AgreesWithEffectDecoder',
    { of: [Schema.String], subject: reportDecodes, runs: 100, arbitrary: { seed: 497_005 } },
    (subject, [text]) =>
      subject(specReportOf(text)) &&
      Arr.every(
        [specReportOf(text), ...removalsOf(text).map((removal) => removal.report)],
        (report) => subject(report) === shippedAccepts(report),
      ),
  )
}
