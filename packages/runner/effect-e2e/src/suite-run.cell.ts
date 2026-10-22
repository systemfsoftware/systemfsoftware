import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect, Schema } from 'effect'
import type { E2eConfig } from './config.schema.js'
import { CollectionFailed, ReportInvalid } from './errors.schema.js'
import { executeSuite } from './execute.js'
import type { GatewayState } from './execute.js'
import { FoldRunStatus, foldStatus } from './fold-status.workflow.js'
import { countsOf, Report } from './report.schema.js'
import { SuiteFsError } from './suite-fs.schema.js'
import { SuiteFs } from './suite-fs.service.js'

export interface RunSuiteInput {
  readonly config: E2eConfig
  readonly files: ReadonlyArray<string>
  readonly platform: string
  readonly gateway: GatewayState
  readonly interrupted: () => boolean
}

export interface SuiteRunAnswer {
  readonly status: Report['status']
  readonly reportPath: string
}

export type SuiteRunFailure = CollectionFailed | ReportInvalid | SuiteFsError

const readSuite = (input: RunSuiteInput): Effect.Effect<FoldRunStatus, SuiteRunFailure, SuiteFs> =>
  Effect.gen(function*() {
    const execution = yield* executeSuite({
      files: input.files,
      platform: input.platform,
      gateway: input.gateway,
      defaultTimeoutMs: input.config.timeout ?? 120_000,
      interrupted: input.interrupted,
    })
    return new FoldRunStatus({
      projectId: input.config.projectId,
      tests: [...execution.tests],
      suiteState: execution.suiteState,
    })
  })

const writeReport = (
  status: Report['status'],
  command: FoldRunStatus,
): Effect.Effect<SuiteRunAnswer, SuiteRunFailure, SuiteFs> =>
  Effect.gen(function*() {
    const fs = yield* SuiteFs
    const report: Report = {
      schema: 'report-1',
      projectId: command.projectId,
      status,
      counts: countsOf(command.tests),
      tests: [...command.tests],
    }
    const encoded = yield* Effect.mapError(
      Schema.encodeUnknownEffect(Report)(report),
      (error) => new ReportInvalid({ message: error.message }),
    )
    yield* fs.writeFileString('.e2e/report.json', `${JSON.stringify(encoded, null, 2)}\n`)
    const written = yield* fs.readFileString('.e2e/report.json')
    yield* Effect.mapError(
      Schema.decodeEffect(Schema.fromJsonString(Report))(written),
      (error) => new ReportInvalid({ message: error.message }),
    )
    return { status, reportPath: '.e2e/report.json' }
  })

export const suiteRun = Sandwich.named('e2e.suite.run')(readSuite)
  .decide(foldStatus)
  .write({
    RunPassed: (_decision, command) => writeReport('passed', command),
    RunFailed: (_decision, command) => writeReport('failed', command),
    RunBlocked: (_decision, command) => writeReport('blocked', command),
    RunErrored: (_decision, command) => writeReport('error', command),
    RunInterrupted: (_decision, command) => writeReport('interrupted', command),
    CommandRejected: (rejected) => Effect.fail(new CollectionFailed({ message: rejected.issue })),
  })
