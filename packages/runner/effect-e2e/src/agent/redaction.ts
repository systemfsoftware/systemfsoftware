import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Predicate from 'effect/Predicate'
import type * as Schema from 'effect/Schema'

import type { Message, ModelRequest } from '../model/model.schema.js'
import type { SecretValue } from './observation.js'

export const redactMessage = (redact: (text: string) => string) => (message: Message): Message =>
  Match.valueTags(message, {
    UserMessage: (user): Message => ({
      ...user,
      content: Arr.map(user.content, (part) =>
        Match.valueTags(part, {
          TextPart: (text): typeof part => ({ ...text, text: redact(text.text) }),
          ImagePart: (image): typeof part => image,
        })),
    }),
    AssistantMessage: (assistant): Message => ({ ...assistant, text: redact(assistant.text) }),
    ToolMessage: (tool): Message => ({ ...tool, content: redact(tool.content) }),
  })

export const redactRequest = (redact: (text: string) => string) => (request: ModelRequest): ModelRequest => ({
  ...request,
  system: redact(request.system),
  messages: Arr.map(request.messages, redactMessage(redact)),
})

type JsonField = readonly [string, Schema.Json]

const isJsonArray = (value: Schema.Json): value is Schema.JsonArray => Array.isArray(value)

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  Predicate.isObject(value) && !isJsonArray(value)

const redactedFieldOf = (redact: (text: string) => string) => ([key, value]: JsonField): JsonField => [
  redact(key),
  redactedJsonOf(redact, value),
]

const redactedObjectOf = (redact: (text: string) => string, record: Schema.JsonObject): Schema.JsonObject =>
  Object.fromEntries(Arr.map(Object.entries(record), redactedFieldOf(redact)))

const redactedJsonOf = (redact: (text: string) => string, value: Schema.Json): Schema.Json =>
  Match.value(value).pipe(
    Match.when(isJsonArray, (items) => Arr.map(items, (item) => redactedJsonOf(redact, item))),
    Match.when(isJsonObject, (record) => redactedObjectOf(redact, record)),
    Match.when(Predicate.isString, (text) => redact(text)),
    Match.orElse((leaf) => leaf),
  )

/** Mask every object key and every string leaf of a JSON value; numbers, booleans and null pass through. */
export const redactJson = (redact: (text: string) => string) => (value: Schema.Json): Schema.Json =>
  redactedJsonOf(redact, value)

// The property laws below pin the walker's contract: after a walk no object key and no string leaf spells a
// held secret, and a walk with no held secret changes nothing. Each planted secret carries a character outside
// the mask alphabet, so no secret is a substring of its own mask text — the one case R5 excepts.

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as undefined, so a static import would ship the test runner,
  // the schema codecs the laws draw from and the observation module they mask with.
  const { it } = await import('@systemfsoftware/vitest')
  const { redactText, SECRET_MASK } = await import('./observation.js')
  const schema = await import('effect/Schema')

  const MASK_NAME = 'S_VAULT'

  const countOf = (text: string, part: string): number => text.split(part).length - 1

  const lettersOf = (raw: string): string => raw.replace(/[^a-z0-9]/gu, '').slice(0, 24)

  const paddedWordOf = (letters: string): string => letters.length >= 4 ? letters : `${letters}qzq0`.slice(0, 4)

  const withLetterOf = (padded: string): string => /[a-z]/u.test(padded) ? padded : `${padded}q`

  /** A lowercase-alphanumeric word (>= 4 chars, at least one letter) so a drawn string always yields a secret. */
  const wordOf = (raw: string): string => withLetterOf(paddedWordOf(lettersOf(raw)))

  const framedSecretOf = (raw: string): SecretValue => ({ name: MASK_NAME, value: `~${wordOf(raw)}~` })

  const redactingWith = (secrets: ReadonlyArray<SecretValue>) => (text: string): string => redactText(secrets, text)

  /** The secret as it appears inside a JSON string literal. */
  const escapedOf = (text: string): string => JSON.stringify(text).slice(1, -1)

  const plantedSecretOf = (drawn: Schema.Json, secret: string): Schema.Json => ({
    drawn,
    nested: [{ [secret]: { leaf: secret } }],
  })

  it.prop(
    '∀j_PlantedSecret_¬∈Stringify',
    { of: [schema.Json, schema.String], subject: redactJson, arbitrary: { seed: 643_001 } },
    (subject, [drawn, raw]) => {
      const secret = framedSecretOf(raw)
      const stringified = JSON.stringify(subject(redactingWith([secret]))(plantedSecretOf(drawn, secret.value)))
      return Arr.every(
        [
          countOf(stringified, SECRET_MASK(secret.name)) >= 2,
          !stringified.includes(secret.value),
          !stringified.includes(escapedOf(secret.value)),
        ],
        (check) => check,
      )
    },
  )

  it.prop(
    '∀j_EscapedSecret_¬∈Stringify',
    { of: [schema.Json, schema.String], subject: redactJson, arbitrary: { seed: 643_002 } },
    (subject, [drawn, raw]) => {
      const secret: SecretValue = { name: 'S_ESCAPE', value: `pa"ss\\${wordOf(raw)}wörd` }
      const stringified = JSON.stringify(subject(redactingWith([secret]))(plantedSecretOf(drawn, secret.value)))
      return Arr.every(
        [
          stringified.includes(SECRET_MASK(secret.name)),
          !stringified.includes(secret.value),
          !stringified.includes(escapedOf(secret.value)),
        ],
        (check) => check,
      )
    },
  )

  it.prop(
    '∀j_NoHeldSecret_≡Identity',
    { of: [schema.Json], subject: redactJson, arbitrary: { seed: 643_003 } },
    (subject, [drawn]) => JSON.stringify(subject(redactingWith([]))(drawn)) === JSON.stringify(drawn),
  )

  it.prop(
    '∀v_JsonScalar_≡Unchanged',
    {
      of: [schema.Union([schema.Finite, schema.Boolean, schema.Null])],
      subject: redactJson,
      arbitrary: { seed: 643_004 },
    },
    (subject, [scalar]) => {
      const secret: SecretValue = { name: 'S_SCALAR', value: '~held~' }
      const walked = subject(redactingWith([secret]))({ held: secret.value, nested: [scalar, { scalar }] })
      return JSON.stringify(walked) ===
        JSON.stringify({ held: SECRET_MASK(secret.name), nested: [scalar, { scalar }] })
    },
  )
}
