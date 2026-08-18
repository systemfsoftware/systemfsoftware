import * as S from 'effect/Schema'

import { forkOptionsSchema } from './fork-schema.schema.js'

/** The fork's option document: `StrykerOptionsSchema` minus the removed surface, plus the fork options. */
export const forkCoreSchema: Record<string, unknown> = S.toJsonSchemaDocument(forkOptionsSchema).schema
