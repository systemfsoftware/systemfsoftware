import type * as JsonSchema from 'effect/JsonSchema'
import * as Schema from 'effect/Schema'

import { Report1 } from './report.schema.js'

export const report1JsonSchema = (): JsonSchema.Document<'draft-2020-12'> => Schema.toJsonSchemaDocument(Report1)
