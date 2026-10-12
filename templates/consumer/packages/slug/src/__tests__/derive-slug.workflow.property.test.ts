import { it } from '@systemfsoftware/vitest'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { DeriveSlug } from '../derive-slug.schema.js'
import { deriveSlug } from '../derive-slug.workflow.js'
import { isSlug, Slug } from '../Slug.schema.js'

const NO_SLUG = undefined

const slugOf = (derive: typeof deriveSlug, text: string): string | undefined =>
  Result.match(derive(new DeriveSlug({ text })), {
    onFailure: (never: never): never => never,
    onSuccess: (decision) =>
      Match.value(decision).pipe(
        Match.tag('SlugDerived', (derived) => derived.slug),
        Match.tag('NoSlugInText', () => NO_SLUG),
        Match.exhaustive,
      ),
  })

const punctuation = ' -_.,!?/'

it.prop(
  '∀s_DeriveSlugOfSlug_=s',
  { of: [Slug], subject: deriveSlug },
  (subject, [s]) => slugOf(subject, s) === (s === '' ? NO_SLUG : s),
)

it.prop(
  '∀s_DeriveSlugOfSpacedUppercaseSlug_=s',
  { of: [Slug], subject: deriveSlug },
  (subject, [s]) => slugOf(subject, s.replaceAll('-', ' ').toUpperCase()) === (s === '' ? NO_SLUG : s),
)

it.prop(
  '∀t_DeriveSlugOfDerivedSlug_=DerivedSlug',
  { of: [Schema.String], subject: deriveSlug },
  (subject, [text]) => {
    const derived = slugOf(subject, text)
    return derived === NO_SLUG || slugOf(subject, derived) === derived
  },
)

it.prop(
  '∀t_DeriveSlugOfPunctuation_=NoSlugInText',
  { of: [Schema.String], subject: deriveSlug },
  (subject, [text]) =>
    slugOf(
      subject,
      text.replaceAll(/[\s\S]/gu, (char) => punctuation.charAt((char.codePointAt(0) ?? 0) % punctuation.length)),
    ) === NO_SLUG,
)

it.prop(
  '∀t_DerivedSlug_∈NonEmptySlug',
  { of: [Schema.String], subject: deriveSlug },
  (subject, [text]) => {
    const derived = slugOf(subject, text)
    return derived === NO_SLUG || (derived !== '' && isSlug(derived))
  },
)

it.prop(
  '∀t_IsSlug_≡FixedPointOfDeriveSlug',
  { of: [Schema.String], subject: isSlug },
  (subject, [text]) => subject(text) === ((slugOf(deriveSlug, text) ?? '') === text),
)
