import { Schema } from 'effect'

import {
  EntrypointResolutionAnalysisSchema,
  ModuleKindSchema,
  ResolutionKindSchema,
  ResolutionOptionSchema,
} from './problem.schema.js'

export { ResolutionKindSchema, ResolutionOptionSchema }

export const ProgramInfoSchema = Schema.Struct({
  moduleKinds: Schema.optional(Schema.Record({ key: Schema.String, value: ModuleKindSchema })),
})
export type ProgramInfo = Schema.Schema.Type<typeof ProgramInfoSchema>

export const EntrypointInfoSchema = Schema.Struct({
  subpath: Schema.String,
  resolutions: Schema.Record({
    key: ResolutionKindSchema,
    value: Schema.suspend(() => EntrypointResolutionAnalysisSchema),
  }),
  hasTypes: Schema.Boolean,
  isWildcard: Schema.Boolean,
})
export type EntrypointInfo = Schema.Schema.Type<typeof EntrypointInfoSchema>
