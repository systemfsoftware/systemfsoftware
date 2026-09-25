import { Schema } from 'effect'

export const ObservationWindowSpec = Schema.Struct({
  serviceName: Schema.NonEmptyString,
})
export type ObservationWindowSpec = typeof ObservationWindowSpec.Type
