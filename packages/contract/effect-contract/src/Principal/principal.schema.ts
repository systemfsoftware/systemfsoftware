import { Array as Arr, Boolean as Bool, Result, Schema } from 'effect'
import { Scope } from '../Contract/exposure.schema.js'

export const Subject = Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255)), Schema.brand('Subject'))
export type Subject = typeof Subject.Type

export class Anonymous extends Schema.TaggedClass<Anonymous>()('Anonymous', {}) {}

export class Person extends Schema.TaggedClass<Person>()('Person', {
  subject: Subject,
  scopes: Schema.Array(Scope),
}) {}

export const Principal = Schema.Union([Anonymous, Person])
export type Principal = typeof Principal.Type

const seeds = ['', 'a', 'a'.repeat(255), 'a'.repeat(256), 'auth0|abc']

const isSubjectClaim = (subject: string): boolean => Bool.every([subject.length >= 1, subject.length <= 255])

const subjectDecodes = (subject: string): boolean => Result.isSuccess(Schema.decodeResult(Subject)(subject))

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀s_SubjectRefusal_≡BoundedNonEmpty',
    { of: [Schema.String], subject: subjectDecodes },
    (subject, [claim]) =>
      Arr.every(Arr.append(seeds, claim), (candidate) => subject(candidate) === isSubjectClaim(candidate)),
  )
}
