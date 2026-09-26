import * as Schema from 'effect/Schema'

/** The init command: the file name `init` writes, resolved against the working folder. */
export const InitConfig = Schema.TaggedStruct('InitConfig', {
  targetFileName: Schema.String,
})
export type InitConfig = typeof InitConfig.Type
