import { Schema } from 'effect'

export class MachineLeftBehind extends Schema.TaggedError<MachineLeftBehind>()('MachineLeftBehind', {
  names: Schema.Array(Schema.String),
}) {}
