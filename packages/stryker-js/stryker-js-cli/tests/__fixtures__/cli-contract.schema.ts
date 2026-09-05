/**
 * The wire schemas the CLI contract lane decodes the packed `stryker` stream
 * against. Extracted from the integration test so module-scope schema
 * declarations live in `*.schema.ts` files; the test imports the schemas and
 * the `StreamLine` type from here.
 */
import * as S from 'effect/Schema'

export interface StreamLine {
  readonly kind: string
  readonly runId?: string | undefined
  readonly schemaVersion?: string | undefined
  readonly mode?: string | undefined
  readonly phase?: string | undefined
  readonly elapsedMs?: number | undefined
  readonly id?: string | undefined
  readonly status?: string | undefined
  readonly file?: string | undefined
  readonly mutator?: string | undefined
  readonly replacement?: string | null | undefined
  readonly completed?: number | undefined
  readonly total?: number | null | undefined
  readonly score?: number | null | undefined
  readonly thresholds?: { readonly high: number; readonly low: number; readonly break: number | null } | undefined
  readonly reportFile?: string | null | undefined
  readonly code?: number | undefined
  readonly error?: string | undefined
  readonly remediation?: string | undefined
  readonly help?: string | undefined
  readonly manifest?: string | undefined
  readonly mutants?: readonly DecodedMutant[] | undefined
  readonly [field: string]: unknown
}

export const LocationSchema = S.Struct({
  start: S.Struct({ line: S.Finite, column: S.Finite }),
  end: S.Struct({ line: S.Finite, column: S.Finite }),
})

export const MutantSchema = S.Struct({
  id: S.String,
  file: S.String,
  location: LocationSchema,
  mutator: S.String,
  replacement: S.NullOr(S.String),
  status: S.String,
})

type DecodedMutant = S.Schema.Type<typeof MutantSchema>

const StreamLineFields = {
  kind: S.String,
  runId: S.optional(S.String),
  schemaVersion: S.optional(S.String),
  mode: S.optional(S.String),
  phase: S.optional(S.String),
  elapsedMs: S.optional(S.Finite),
  id: S.optional(S.String),
  status: S.optional(S.String),
  file: S.optional(S.String),
  location: S.optional(LocationSchema),
  mutator: S.optional(S.String),
  replacement: S.optional(S.NullOr(S.String)),
  completed: S.optional(S.Finite),
  total: S.optional(S.NullOr(S.Finite)),
  score: S.optional(S.NullOr(S.Finite)),
  thresholds: S.optional(S.Struct({ high: S.Finite, low: S.Finite, break: S.NullOr(S.Finite) })),
  reportFile: S.optional(S.NullOr(S.String)),
  code: S.optional(S.Finite),
  error: S.optional(S.String),
  remediation: S.optional(S.String),
  help: S.optional(S.String),
  manifest: S.optional(S.String),
  mutants: S.optional(S.Array(MutantSchema)),
}

export const StreamLineSchema = S.StructWithRest(S.Struct(StreamLineFields), [S.Record(S.String, S.Unknown)])

export const ManifestSchema = S.Struct({
  tool: S.String,
  commands: S.Array(
    S.Struct({
      subcommands: S.Array(S.Struct({ name: S.String, description: S.String })),
    }),
  ),
})
