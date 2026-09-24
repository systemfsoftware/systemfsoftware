import { Schema } from 'effect'

export class LeadershipStillHeld extends Schema.TaggedError<LeadershipStillHeld>()(
  'LeadershipStillHeld',
  { key: Schema.String },
) {}
