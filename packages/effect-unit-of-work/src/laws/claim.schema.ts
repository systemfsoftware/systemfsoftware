import { Schema } from 'effect'

/** A claim was granted a seat. */
export class Granted extends Schema.TaggedClass<Granted>()('Granted', {}) {}

/** A claim was refused because the cap was already reached. */
export class Refused extends Schema.TaggedClass<Refused>()('Refused', {}) {}

/** What one claim decided. */
export type ClaimDecision = Granted | Refused
