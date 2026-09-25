import * as Schema from 'effect/Schema'

/** The init command: the file name `init` writes, resolved against the working folder. */
export class InitConfig extends Schema.TaggedClass<InitConfig>()('InitConfig', {
  targetFileName: Schema.String,
}) {}
