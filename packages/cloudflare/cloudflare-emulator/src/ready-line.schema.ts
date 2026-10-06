import { Schema } from 'effect'

export const EmulatorReadyLine = Schema.fromJsonString(
  Schema.Struct({
    ready: Schema.Literal(true),
    port: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
  }),
)
export type EmulatorReadyLine = typeof EmulatorReadyLine.Type
