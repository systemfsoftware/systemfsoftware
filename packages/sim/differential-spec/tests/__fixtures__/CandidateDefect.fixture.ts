import { Schema } from 'effect'

export class CandidateDefect
  extends Schema.TaggedError<CandidateDefect, { readonly brand: unique symbol }>()('CandidateDefect', {})
{}
