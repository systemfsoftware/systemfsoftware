import { Array as Arr, Boolean as Bool, Result, Schema } from 'effect'

export const Scope = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[a-z][a-z0-9:._-]{0,63}$/)),
  Schema.brand('Scope'),
)
export type Scope = typeof Scope.Type

export class Public extends Schema.TaggedClass<Public>()('Public', {}) {}

export class Restricted extends Schema.TaggedClass<Restricted>()('Restricted', { scopes: Schema.Array(Scope) }) {}

export const Exposure = Schema.Union([Public, Restricted])
export type Exposure = typeof Exposure.Type

const seeds = ['', 'write', 'Write', 'read:balance', 'a.b_c-d', '1abc', 'has space', 'a'.repeat(65), 'a'.repeat(64)]

const lowerAscii = 'abcdefghijklmnopqrstuvwxyz'
const scopeTail = `${lowerAscii}0123456789:._-`

const isScopeToken = (scope: string): boolean =>
  Bool.every([
    scope.length >= 1,
    scope.length <= 64,
    lowerAscii.includes(scope.charAt(0)),
    Arr.every(Array.from(scope.slice(1)), (char) => scopeTail.includes(char)),
  ])

const scopeDecodes = (scope: string): boolean => Result.isSuccess(Schema.decodeResult(Scope)(scope))

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀s_ScopeRefusal_≡LowercaseScopeToken',
    { of: [Schema.String], subject: scopeDecodes },
    (subject, [scope]) =>
      Arr.every(Arr.append(seeds, scope), (candidate) => subject(candidate) === isScopeToken(candidate)),
  )
}
