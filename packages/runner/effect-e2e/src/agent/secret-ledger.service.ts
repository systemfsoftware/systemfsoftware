import * as Arr from 'effect/Array'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'

import type { SecretRef } from '../Config/names.schema.js'
import { PolicyDenied, SecretUnavailable } from '../verdict/failure.schema.js'
import { redactCut, redactText, type SecretValue } from './observation.js'

export interface SecretLedgerShape {
  /** Fails on the first unknown name. */
  readonly require: (names: ReadonlyArray<string>) => Effect.Effect<void, SecretUnavailable>
  /** Returns the value for an engine call and marks secrets as on screen. */
  readonly fill: (ref: SecretRef) => Effect.Effect<string, SecretUnavailable>
  /** Runs the capture, unless a fill happened in this ledger, in which case the policy refuses. */
  readonly screenshot: <A, E, R>(capture: Effect.Effect<A, E, R>) => Effect.Effect<A, E | PolicyDenied, R>
  /** Mask every held value in the text. */
  readonly redact: (text: string) => string
  /** Mask a field cut at `limit`, as in `redactCut` over every held value. */
  readonly redactCut: (limit: number, text: string) => string
}

const secretUnavailable = (name: string): SecretUnavailable =>
  new SecretUnavailable({
    message: `the secret "${name}" is not available to this step`,
    evidence: [{ _tag: 'LogEvidence', text: `secret ${name}` }],
  })

const policyDenied: PolicyDenied = new PolicyDenied({
  message: 'a screenshot after a secret fill could show the secret, so this attempt takes no further screenshot',
  evidence: [{ _tag: 'LogEvidence', text: 'secrets on screen' }],
})

const heldValuesOf = (values: Readonly<Record<string, Redacted.Redacted<string>>>): ReadonlyArray<SecretValue> =>
  Object.entries(values).map(([name, redacted]) => ({ name, value: Redacted.value(redacted) }))

const missingIn = (values: Readonly<Record<string, Redacted.Redacted<string>>>, name: string): boolean =>
  Option.isNone(Option.fromNullishOr(values[name]))

const requireAll = (
  values: Readonly<Record<string, Redacted.Redacted<string>>>,
  names: ReadonlyArray<string>,
): Effect.Effect<void, SecretUnavailable> =>
  Option.match(Arr.findFirst(names, (name) => missingIn(values, name)), {
    onNone: () => Effect.void,
    onSome: (name) => Effect.fail(secretUnavailable(name)),
  })

const fillOf = (
  values: Readonly<Record<string, Redacted.Redacted<string>>>,
  onScreen: Ref.Ref<boolean>,
  ref: SecretRef,
): Effect.Effect<string, SecretUnavailable> =>
  Option.match(Option.fromNullishOr(values[ref.secret]), {
    onNone: () => Effect.fail(secretUnavailable(ref.secret)),
    onSome: (redacted) => Effect.map(Ref.set(onScreen, true), () => Redacted.value(redacted)),
  })

const screenshotWith = <A, E, R>(
  onScreen: Ref.Ref<boolean>,
  capture: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | PolicyDenied, R> =>
  Effect.flatMap(
    Ref.get(onScreen),
    (filled): Effect.Effect<A, E | PolicyDenied, R> => filled ? Effect.fail(policyDenied) : capture,
  )

export class SecretLedger extends Context.Service<SecretLedger, SecretLedgerShape>()(
  '@systemfsoftware/effect-e2e/SecretLedger',
) {
  static readonly make = (
    values: Readonly<Record<string, Redacted.Redacted<string>>>,
  ): Effect.Effect<SecretLedgerShape> =>
    Effect.map(Ref.make(false), (onScreen) => {
      const secrets = heldValuesOf(values)
      return {
        require: (names: ReadonlyArray<string>) => requireAll(values, names),
        fill: (ref: SecretRef) => fillOf(values, onScreen, ref),
        screenshot: <A, E, R>(capture: Effect.Effect<A, E, R>) => screenshotWith(onScreen, capture),
        redact: (text: string) => redactText(secrets, text),
        redactCut: (limit: number, text: string) => redactCut(secrets, limit, text),
      }
    })

  static readonly layer = (
    values: Readonly<Record<string, Redacted.Redacted<string>>>,
  ): Layer.Layer<SecretLedger> => Layer.effect(this)(SecretLedger.make(values))
}
