import { Schema } from 'effect'

export class ObservationWindowSpec extends Schema.Class<ObservationWindowSpec>('ObservationWindowSpec')({
  serviceName: Schema.NonEmptyString,
}) {}
