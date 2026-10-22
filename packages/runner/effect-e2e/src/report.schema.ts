import { Schema } from 'effect'

const RunStatusTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/RunStatus')
type RunStatusTypeId = typeof RunStatusTypeId

export class RunPassed extends Schema.TaggedClass<RunPassed>()('RunPassed', {}) {
  readonly [RunStatusTypeId] = RunStatusTypeId
}
export class RunFailed extends Schema.TaggedClass<RunFailed>()('RunFailed', {
  failed: Schema.Finite,
}) {
  readonly [RunStatusTypeId] = RunStatusTypeId
}
export class RunBlocked extends Schema.TaggedClass<RunBlocked>()('RunBlocked', {
  blocked: Schema.Finite,
}) {
  readonly [RunStatusTypeId] = RunStatusTypeId
}
export class RunErrored extends Schema.TaggedClass<RunErrored>()('RunErrored', {
  message: Schema.String,
}) {
  readonly [RunStatusTypeId] = RunStatusTypeId
}
export class RunInterrupted extends Schema.TaggedClass<RunInterrupted>()('RunInterrupted', {}) {
  readonly [RunStatusTypeId] = RunStatusTypeId
}

export const RunStatus = Schema.Union([RunPassed, RunFailed, RunBlocked, RunErrored, RunInterrupted])
export type RunStatus = typeof RunStatus.Type

export const TestStatus = Schema.Literals(['passed', 'failed', 'skipped', 'blocked'])
export type TestStatus = typeof TestStatus.Type

export const TestRecord = Schema.Struct({
  file: Schema.String,
  name: Schema.String,
  status: TestStatus,
  reason: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  modelCalls: Schema.Finite,
})
export type TestRecord = typeof TestRecord.Type

export const Counts = Schema.Struct({
  passed: Schema.Finite,
  failed: Schema.Finite,
  skipped: Schema.Finite,
  blocked: Schema.Finite,
})
export type Counts = typeof Counts.Type

export const ReportStatus = Schema.Literals(['passed', 'failed', 'blocked', 'error', 'interrupted'])
export type ReportStatus = typeof ReportStatus.Type

export const Report = Schema.Struct({
  schema: Schema.Literals(['report-1']),
  projectId: Schema.String,
  status: ReportStatus,
  counts: Counts,
  tests: Schema.Array(TestRecord),
})
export type Report = typeof Report.Type

export const countsOf = (records: ReadonlyArray<TestRecord>): Counts => ({
  passed: records.filter((record) => record.status === 'passed').length,
  failed: records.filter((record) => record.status === 'failed').length,
  skipped: records.filter((record) => record.status === 'skipped').length,
  blocked: records.filter((record) => record.status === 'blocked').length,
})
