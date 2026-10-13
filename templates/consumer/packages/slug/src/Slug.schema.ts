import { Schema } from 'effect'

export const Slug = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/u)),
  Schema.brand('Slug'),
)
export type Slug = typeof Slug.Type

/** Whether a value is a {@link Slug}. */
export const isSlug = Schema.is(Slug)
