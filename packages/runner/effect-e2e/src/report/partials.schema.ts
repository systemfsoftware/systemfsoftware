import * as Schema from 'effect/Schema'

import { Report1 } from './report.schema.js'

/**
 * Whether a worker's partial holds everything it will record. A worker rewrites its partial `in-progress` as it
 * runs and `finished` after its last test file, so a worker that dies leaves an `in-progress` partial behind.
 */
export const PartialState = Schema.Literals(['in-progress', 'finished'])
export type PartialState = typeof PartialState.Type

const EncodedReport1 = Schema.toEncoded(Report1)

export const EncodedPartial = Schema.fromJsonString(EncodedReport1)
