import * as Schema from 'effect/Schema'

export class InitConfig extends Schema.TaggedClass<InitConfig>()('InitConfig', {
  targetFileName: Schema.String,
}) {}
