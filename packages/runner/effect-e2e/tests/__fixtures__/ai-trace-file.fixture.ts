import * as Schema from 'effect/Schema'

export const TraceFile = Schema.fromJsonString(Schema.Struct({
  schema: Schema.Literal('ai-trace-1'),
  test: Schema.Struct({ id: Schema.String, title: Schema.String }),
  target: Schema.String,
  agent: Schema.String,
  retry: Schema.Finite,
  calls: Schema.Array(Schema.Struct({
    step: Schema.String,
    request: Schema.Struct({
      model: Schema.String,
      messages: Schema.Array(Schema.Json),
      tools: Schema.Array(Schema.Struct({ name: Schema.String })),
    }),
    outcome: Schema.Json,
  })),
}))
export type TraceFile = typeof TraceFile.Type
