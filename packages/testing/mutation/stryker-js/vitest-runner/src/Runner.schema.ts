import { Effect } from 'effect'
import * as S from 'effect/Schema'

import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
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

export class VitestDryRunCommand extends S.TaggedClass<VitestDryRunCommand>()('VitestDryRunCommand', {
  rawTests: S.Array(S.Unknown),
  projectRoot: S.String,
  hasExternalError: S.Boolean,
  externalErrorText: S.String,
}) {}

export class DryRunComplete extends S.TaggedClass<DryRunComplete>()('Complete', {
  testsJson: S.String,
}) {}

export class DryRunExternalError extends S.TaggedClass<DryRunExternalError>()('Error', {
  testsJson: S.String,
  errorMessage: S.String,
}) {}

export type VitestDryRunOutcome = DryRunComplete | DryRunExternalError
