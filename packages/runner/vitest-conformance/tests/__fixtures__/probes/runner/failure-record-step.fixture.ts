import { Schema } from 'effect'

export class Unauthorized
  extends Schema.TaggedError<Unauthorized, { readonly brand: unique symbol }>()('Unauthorized', { user: Schema.String })
{}
