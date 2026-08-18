import { Schema } from 'effect'

import { IncludedTypesSchema, TypesPackageSchema } from '../../src/Analysis.schema.js'
import { ProblemSchema, ResolutionOptionSchema } from '../../src/Problem.schema.js'
import { EntrypointInfoSchema } from '../../src/Resolution.schema.js'

/**
 * The recorded snapshot wire format, as owned by this suite: the fields the
 * recorded snapshot actually pins. Leaf vocabulary (build tools, types
 * packages, entrypoints, problems, resolution options) is composed from the
 * schemas in `src/`; the document layout is declared here so the test decodes
 * a recorded snapshot through one typed boundary instead of raw `any`.
 */
const AnalysisRecordSchema = Schema.Struct({
  packageName: Schema.String,
  packageVersion: Schema.String,
  buildTools: Schema.Record(Schema.String, Schema.String),
  types: Schema.Union([IncludedTypesSchema, TypesPackageSchema]),
  entrypoints: Schema.Record(Schema.String, EntrypointInfoSchema),
  programInfo: Schema.Record(ResolutionOptionSchema, Schema.Any),
  problems: Schema.Array(ProblemSchema),
})

const UnanalysedRecordSchema = Schema.Struct({
  packageName: Schema.String,
  packageVersion: Schema.String,
  types: Schema.Literal(false),
})

export const SnapshotRecordSchema = Schema.Union([AnalysisRecordSchema, UnanalysedRecordSchema])
export type SnapshotRecord = Schema.Schema.Type<typeof SnapshotRecordSchema>
