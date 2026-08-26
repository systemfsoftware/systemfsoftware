/**
 * Runner schemas — declarations for the vitest runner capability.
 *
 * Houses every Schema/Wire type this capability publishes or decodes
 * internally: option validation, coverage/task metadata, sandbox
 * manifest, and the dynamic vitest module shape.
 */
import { Effect } from 'effect'
import * as S from 'effect/Schema'

import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import type * as VitestNode from 'vitest/node'

// ---------------------------------------------------------------------------
// Vitest runner options
// ---------------------------------------------------------------------------

/**
 * The `vitest` option section of the Stryker options document. `related`
 * defaults to `true` at decode, the other members are optional.
 */
export const VitestRunnerOptionsSchema = S.Struct({
  dir: S.optional(S.String),
  related: S.optional(S.Boolean).pipe(S.withDecodingDefault(Effect.succeed(true))),
  configFile: S.optional(S.String),
})

export type VitestRunnerOptions = S.Schema.Type<typeof VitestRunnerOptionsSchema>

/**
 * The `vitest` section of the Stryker options document: absent from the input
 * document, or present as a partial, and decoded into the section defaults.
 */
export const VitestSectionSchema = S.optional(VitestRunnerOptionsSchema).pipe(
  S.withDecodingDefault(Effect.succeed({ related: true })),
)

export interface StrykerVitestRunnerOptions {
  vitest: VitestRunnerOptions
}

export interface VitestRunnerOptionsWithStrykerOptions extends StrykerVitestRunnerOptions, StrykerOptions {}

// ---------------------------------------------------------------------------
// Coverage / task metadata (decoded from vitest file meta)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Sandbox self-alias manifest (package.json exports with @systemfsoftware/source)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Dynamic vitest/node + vitest package shape
// ---------------------------------------------------------------------------

/**
 * The dynamically imported project-local `vitest/node` module. The runtime
 * check only asserts object-likeness: the module namespace is whatever the
 * resolved package exports, and the consumers tolerate a missing
 * `createVitest` via their own fallbacks.
 */
export const VitestNodeModuleSchema = S.declare(
  (input: unknown): input is typeof VitestNode => input !== null && typeof input === 'object' && !Array.isArray(input),
  { description: 'The project-local vitest/node module' },
)

/** The `package.json` document of a resolved vitest package. */
export const VitestPackageSchema = S.Struct({ version: S.String })
