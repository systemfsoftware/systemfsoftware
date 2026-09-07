import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import { TestResultSchema } from '@systemfsoftware/stryker-js/TestRunner'
import { Effect } from 'effect'
import * as S from 'effect/Schema'
import type * as VitestNode from 'vitest/node'

export const VitestRunnerOptionsSchema = S.Struct({
  dir: S.optional(S.String),
  related: S.optional(S.Boolean).pipe(S.withDecodingDefault(Effect.succeed(true))),
  configFile: S.optional(S.String),
})

export type VitestRunnerOptions = S.Schema.Type<typeof VitestRunnerOptionsSchema>

export const VitestSectionSchema = S.optional(VitestRunnerOptionsSchema).pipe(
  S.withDecodingDefault(Effect.succeed({ related: true })),
)

export interface StrykerVitestRunnerOptions {
  vitest: VitestRunnerOptions
}

export interface VitestRunnerOptionsWithStrykerOptions extends StrykerVitestRunnerOptions, StrykerOptions {}

export const HitCountMetaSchema = S.Struct({ hitCount: S.optional(S.Finite) })

export const MutantCoverageMetaSchema = S.Struct({
  mutantCoverage: S.optional(
    S.Struct({
      static: S.Record(S.String, S.Finite),
      perTest: S.Record(S.String, S.Record(S.String, S.Finite)),
    }),
  ),
})

export const MutantCoverageShapeSchema = S.Struct({
  static: S.Record(S.String, S.Finite),
  perTest: S.Record(S.String, S.Record(S.String, S.Finite)),
})

export class CoverageDecodeFailed extends S.TaggedError<CoverageDecodeFailed>()('CoverageDecodeFailed', {
  cause: S.Unknown,
}) {}

export const ExportEntry = S.Union([S.String, S.Record(S.String, S.Unknown)])

export const PackageManifest = S.StructWithRest(
  S.Struct({
    name: S.optional(S.String),
    exports: S.optional(S.Record(S.String, ExportEntry)),
  }),
  [S.Record(S.String, S.Unknown)],
)

export type PackageManifest = S.Schema.Type<typeof PackageManifest>
export type ExportEntry = S.Schema.Type<typeof ExportEntry>

export const VitestNodeModuleSchema = S.declare(
  (input: unknown): input is typeof VitestNode => input !== null && typeof input === 'object' && !Array.isArray(input),
  { description: 'The project-local vitest/node module' },
)

export const VitestPackageSchema = S.Struct({ version: S.String })

export type VitestTaskState = typeof TaskState.Type

interface VitestTaskBase {
  readonly name?: string | undefined
  readonly mode?: 'run' | 'skip' | undefined
  readonly type?: string | undefined
  readonly filepath?: string | undefined
  readonly file?: string | VitestTask | undefined
  readonly suite?: VitestTask | undefined
}

export interface VitestTestTask extends VitestTaskBase {
  readonly result: {
    readonly state: VitestTaskState
    readonly duration?: number | undefined
    readonly errors?: readonly { readonly message?: string | undefined }[] | undefined
  }
}

interface VitestSuiteTask extends VitestTaskBase {
  readonly result?:
    | {
      readonly state: VitestTaskState
      readonly duration?: number | undefined
      readonly errors?: readonly { readonly message?: string | undefined }[] | undefined
    }
    | undefined
  readonly tasks: readonly VitestTask[]
}

export type VitestTask = VitestTestTask | VitestSuiteTask

const TaskState = S.Literals(['pass', 'fail', 'skip', 'todo'])

const RunMode = S.Literals(['run', 'skip'])

const TaskResult = S.Struct({
  state: TaskState,
  duration: S.optional(S.Finite.check(S.isGreaterThan(0))),
  errors: S.optional(S.Array(S.Struct({ message: S.optional(S.String) }))),
})

const TaskBaseFields = {
  name: S.optional(S.String),
  mode: S.optional(RunMode),
  type: S.optional(S.String),
  filepath: S.optional(S.String),
  file: S.optional(S.Union([S.String, S.suspend((): S.Codec<VitestTask> => VitestTask)])),
  suite: S.optional(S.suspend((): S.Codec<VitestTask> => VitestTask)),
}

export const VitestTestTask = S.Struct({
  ...TaskBaseFields,
  result: TaskResult,
}).annotate({ identifier: 'VitestTestTask' })

export const VitestSuiteTask = S.Struct({
  ...TaskBaseFields,
  result: S.optional(TaskResult),
  tasks: S.Array(S.suspend((): S.Codec<VitestTask> => VitestTask)),
}).annotate({ identifier: 'VitestSuiteTask' })

export const VitestTask = S.Union([VitestTestTask, VitestSuiteTask]).annotate({
  identifier: 'VitestTask',
})

export const VitestTaskArray = S.Array(VitestTask)

export class VitestDryRunOutput extends S.TaggedClass<VitestDryRunOutput>()('VitestDryRunOutput', {
  status: S.Literals(['Complete', 'Error']),
  tests: S.Array(TestResultSchema),
  errorMessage: S.optional(S.String),
}) {}
