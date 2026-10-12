/// <reference types="vitest/importMeta" />
import { Schema } from 'effect'
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'

export const Slug = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/u)),
  Schema.brand('Slug'),
)
export type Slug = typeof Slug.Type

/** Whether a value is a {@link Slug}. */
export const isSlug = Schema.is(Slug)

const WORD_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

const isWord = (word: string): boolean => word.length > 0 && word.split('').every((char) => WORD_CHARS.includes(char))

const isSlugText = (text: string): boolean => text === '' || text.split('-').every(isWord)

const SLUG_SEEDS: ReadonlyArray<string> = ['', 'a', '0-9', 'a-b-c', '-', '-a', 'a-', 'a--b', 'A', 'a_b', 'a b', 'é']

const decodesAsSlug = (text: string): boolean => Result.isSuccess(Schema.decodeResult(Slug)(text))

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: a static import would put the test-only dependency in the built module graph.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀t_SlugRefusal_≡SlugContract',
    { of: [Schema.String], subject: decodesAsSlug },
    (subject, [text]) =>
      Arr.every(Arr.append(SLUG_SEEDS, text), (candidate) => subject(candidate) === isSlugText(candidate)),
  )
}
