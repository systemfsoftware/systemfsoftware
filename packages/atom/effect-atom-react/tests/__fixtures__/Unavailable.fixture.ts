import * as Schema from 'effect/Schema'

export class Unavailable
  extends Schema.TaggedError<Unavailable, { readonly brand: unique symbol }>()('Unavailable', {})
{}
