import { Schema } from 'effect'

export class Refused extends Schema.TaggedError<Refused>()('Refused', { message: Schema.String }) {}
