import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { InstalledManifest } from './Canary.schema.js'
import {
  Installed,
  InstallVerdict,
  Rejected,
  RejectionStatus,
  RetryInstall,
  Unsettled,
} from './InstallVerdict.schema.js'

export class JudgeInstall extends Schema.TaggedClass<JudgeInstall>()('JudgeInstall', {
  attempt: Schema.Literals([1, 2]),
  exitCode: Schema.Int,
  output: Schema.String,
  installed: Schema.Option(InstalledManifest),
  expectedName: Schema.String,
  expectedVersion: Schema.String,
}) {
  static readonly [Workflow.InstrumentationBrand] = {
    attempt: 'registry_gate.install.attempt',
    exitCode: 'registry_gate.install.exit_code',
  } as const
}

const pnpmStatusPatterns: ReadonlyArray<RegExp> = [
  /HTTP status (?:client|server) error \((\d{3})/g,
  /ERR_PNPM_FETCH_(\d{3})/g,
]

const unwrapLines = (output: string): string => output.replace(/\s+/g, ' ')

const statusesIn = (output: string): ReadonlyArray<number> =>
  pnpmStatusPatterns.flatMap((pattern) =>
    Array.from(unwrapLines(output).matchAll(pattern), (match) => Number(match[1]))
  )

const isRejection = Schema.is(RejectionStatus)

const rejectionIn = (output: string): Option.Option<RejectionStatus> =>
  Option.fromNullishOr(statusesIn(output).find(isRejection))

const describeStatuses = (statuses: ReadonlyArray<number>): string =>
  Match.value(statuses.length).pipe(
    Match.when(0, () => 'no HTTP status'),
    Match.orElse(() => `HTTP statuses ${statuses.join(', ')}`),
  )

const coordinateOf = (name: string, version: string): string => `${name}@${version}`

const isExpected = (command: JudgeInstall) => (manifest: InstalledManifest): boolean =>
  coordinateOf(manifest.name, manifest.version) === coordinateOf(command.expectedName, command.expectedVersion)

const judgeInstalled = (command: JudgeInstall): InstallVerdict =>
  Option.match(Option.filter(command.installed, isExpected(command)), {
    onNone: () =>
      new Unsettled({
        reason: `pnpm add exited 0 but node_modules does not hold ${
          coordinateOf(command.expectedName, command.expectedVersion)
        }`,
      }),
    onSome: (manifest) => new Installed({ name: manifest.name, version: manifest.version }),
  })

const judgeUnrejected = (command: JudgeInstall, detail: string): InstallVerdict =>
  Match.value(command.attempt).pipe(
    Match.when(1, () => new RetryInstall({ detail })),
    Match.when(2, () => new Unsettled({ reason: `${detail}, on both attempts` })),
    Match.exhaustive,
  )

const judgeFailed = (command: JudgeInstall): InstallVerdict =>
  Option.match(rejectionIn(command.output), {
    onNone: () =>
      judgeUnrejected(
        command,
        `pnpm add exited ${command.exitCode} with ${describeStatuses(statusesIn(command.output))}`,
      ),
    onSome: (status) => new Rejected({ status }),
  })

const verdictOf = (command: JudgeInstall): InstallVerdict =>
  Match.value(command.exitCode).pipe(
    Match.when(0, () => judgeInstalled(command)),
    Match.orElse(() => judgeFailed(command)),
  )

export const judgeInstall = Workflow.make({
  command: JudgeInstall,
  decision: InstallVerdict,
  error: Schema.Never,
  decide: (command): Result.Result<InstallVerdict, never> => Result.succeed(verdictOf(command)),
})
