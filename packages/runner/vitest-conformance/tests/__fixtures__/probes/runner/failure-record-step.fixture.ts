import { Schema } from 'effect'

export class Unauthorized extends Schema.TaggedError<Unauthorized>()('Unauthorized', { user: Schema.String }) {}
