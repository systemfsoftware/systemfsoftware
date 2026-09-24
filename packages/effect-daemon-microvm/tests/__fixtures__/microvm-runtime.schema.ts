import { Schema } from 'effect'

export class MachineLeftBehind extends Schema.TaggedError<MachineLeftBehind>()('MachineLeftBehind', {
  names: Schema.Array(Schema.String),
}) {}

export class CheckRejected extends Schema.TaggedError<CheckRejected>()('CheckRejected', {
  report: Schema.String,
}) {}
