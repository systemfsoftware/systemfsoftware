import { Schema } from 'effect'

/** A URL slug: lowercase ASCII letters and digits in words joined by single hyphens, or empty. */
export const Slug = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/u)),
  Schema.brand('Slug'),
)
export type Slug = typeof Slug.Type

/** Whether a value is a {@link Slug}. */
export const isSlug = Schema.is(Slug)
