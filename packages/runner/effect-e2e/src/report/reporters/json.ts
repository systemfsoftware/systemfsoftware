import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { Report1 } from '../report.schema.js'

export const renderJson = (report: Report1): Effect.Effect<string, Schema.SchemaError> =>
  Effect.map(Schema.encodeEffect(Report1)(report), (encoded) => `${JSON.stringify(encoded, null, 2)}\n`)
