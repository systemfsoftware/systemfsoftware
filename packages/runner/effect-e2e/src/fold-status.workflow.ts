import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Order, Schema } from 'effect'
import * as Result from 'effect/Result'
import { RunBlocked, RunFailed, RunInterrupted, RunPassed, RunStatus, TestRecord } from './report.schema.js'

type Severity = 'clean' | 'blocked' | 'failed' | 'interrupted'

const RANK: Record<Severity, number> = { clean: 0, blocked: 1, failed: 2, interrupted: 3 }

const severityOrder: Order.Order<Severity> = Order.mapInput(Order.Number, (severity: Severity) => RANK[severity])

const RECORD_SEVERITY: Record<TestRecord['status'], Severity> = {
  passed: 'clean',
  skipped: 'clean',
  blocked: 'blocked',
  failed: 'failed',
}

const SUITE_SEVERITY: Record<'running' | 'interrupted', Severity> = {
  running: 'clean',
  interrupted: 'interrupted',
}

const countBy = (records: ReadonlyArray<TestRecord>, status: TestRecord['status']): number =>
  records.filter((record) => record.status === status).length

export class FoldRunStatus extends Schema.TaggedClass<FoldRunStatus>()('FoldRunStatus', {
  projectId: Schema.String,
  tests: Schema.Array(TestRecord),
  suiteState: Schema.Literals(['running', 'interrupted']),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const decide = (command: FoldRunStatus): Result.Result<RunStatus, never> =>
  Result.succeed(
    Match.value(
      command.tests.reduce(
        (worst, record) => Order.max(severityOrder)(worst, RECORD_SEVERITY[record.status]),
        SUITE_SEVERITY[command.suiteState],
      ),
    ).pipe(
      Match.when('interrupted', (): RunStatus => new RunInterrupted()),
      Match.when('failed', (): RunStatus => new RunFailed({ failed: countBy(command.tests, 'failed') })),
      Match.when('blocked', (): RunStatus => new RunBlocked({ blocked: countBy(command.tests, 'blocked') })),
      Match.when('clean', (): RunStatus => new RunPassed()),
      Match.exhaustive,
    ),
  )

export const foldStatus = Workflow.make({
  command: FoldRunStatus,
  decision: RunStatus,
  error: Schema.Never,
  decide,
})
