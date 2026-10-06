import { Array as Arr, Boolean as Bool, Result, Schema } from 'effect'

export const OperationName = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[a-z][a-zA-Z0-9]{0,63}$/)),
  Schema.brand('OperationName'),
)
export type OperationName = typeof OperationName.Type

const seeds = [
  '',
  'Transfer',
  'has_underscore',
  'has-dash',
  '2fa',
  'café',
  'a'.repeat(65),
  'a'.repeat(64),
  'a',
  'getBalance2',
]

const lowerAscii = 'abcdefghijklmnopqrstuvwxyz'
const asciiAlphanumeric = `${lowerAscii}${lowerAscii.toUpperCase()}0123456789`

const isLowerCamelIdentifier = (name: string): boolean =>
  Bool.every([
    name.length >= 1,
    name.length <= 64,
    lowerAscii.includes(name.charAt(0)),
    Arr.every(Array.from(name.slice(1)), (char) => asciiAlphanumeric.includes(char)),
  ])

const operationNameDecodes = (name: string): boolean => Result.isSuccess(Schema.decodeResult(OperationName)(name))

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀s_OperationNameRefusal_≡LowerCamelIdentifier',
    { of: [Schema.String], subject: operationNameDecodes },
    (subject, [name]) =>
      Arr.every(Arr.append(seeds, name), (candidate) => subject(candidate) === isLowerCamelIdentifier(candidate)),
  )
}
