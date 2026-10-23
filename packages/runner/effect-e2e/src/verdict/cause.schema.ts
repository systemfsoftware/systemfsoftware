import * as Schema from 'effect/Schema'

import { EvidenceRef } from './check.schema.js'

export const Cause = Schema.Literals(['product', 'automation', 'environment', 'unclassified'])
export type Cause = typeof Cause.Type

export const ProposedCause = Schema.Struct({ cause: Cause, evidence: Schema.Array(EvidenceRef) })
export type ProposedCause = typeof ProposedCause.Type
