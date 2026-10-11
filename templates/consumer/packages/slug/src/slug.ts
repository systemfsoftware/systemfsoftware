/// <reference types="vitest/importMeta" />
import { Slug } from './Slug.schema.js'

/** The slug of `text`: its ASCII letters and digits, lowercased, with every run of anything else as one hyphen. */
export const slug = (text: string): Slug =>
  Slug.make(
    text
      .normalize('NFKD')
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, '-')
      .replaceAll(/^-|-$/gu, ''),
  )

if (import.meta.vitest !== void 0) {
  // A static import would put the test-only dependency in the built module graph.
  const { it } = await import('@systemfsoftware/vitest')
  const { Schema } = await import('effect')
  const { isSlug } = await import('./Slug.schema.js')

  const punctuation = ' -_.,!?/'

  it.prop('∀s_SlugOfSlug_=s', { of: [Slug], subject: slug }, (subject, [s]) => subject(s) === s)

  it.prop(
    '∀s_SlugOfSpacedUppercaseSlug_=s',
    { of: [Slug], subject: slug },
    (subject, [s]) => subject(s.replaceAll('-', ' ').toUpperCase()) === s,
  )

  it.prop(
    '∀t_SlugOfSlugOfText_=SlugOfText',
    { of: [Schema.String], subject: slug },
    (subject, [text]) => subject(subject(text)) === subject(text),
  )

  it.prop(
    '∀t_SlugOfPunctuation_=Empty',
    { of: [Schema.String], subject: slug },
    (subject, [text]) =>
      subject(
        text.replaceAll(/[\s\S]/gu, (char) => punctuation.charAt((char.codePointAt(0) ?? 0) % punctuation.length)),
      ) === '',
  )

  it.prop('∀t_SlugOfText_∈Slug', { of: [Schema.String], subject: slug }, (subject, [text]) => isSlug(subject(text)))

  it.prop(
    '∀t_IsSlug_≡FixedPointOfSlug',
    { of: [Schema.String], subject: isSlug },
    (subject, [text]) => subject(text) === (slug(text) === text),
  )
}
