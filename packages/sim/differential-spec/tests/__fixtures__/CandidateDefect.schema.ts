import { Schema } from 'effect'

export class CandidateDefect extends Schema.TaggedError<CandidateDefect>()('CandidateDefect', {}) {}
