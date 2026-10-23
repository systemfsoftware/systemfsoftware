import { it } from '@systemfsoftware/vitest'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Redacted from 'effect/Redacted'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { Unique, unique } from '../../Config/values.schema.js'
import { type CacheKeyDecision, DeriveKey, deriveKey } from '../derive-key.workflow.js'
import { keyDigestOf } from '../key-digest.js'
import type { KeyDigest, ParamValue, StepParams } from '../key.schema.js'

type Derive = typeof deriveKey

const KEYED_FIELDS = ['project', 'test', 'target', 'engine', 'app', 'instruction', 'agent'] as const

const isUnique = Schema.is(Unique)

const decisionOf = (derive: Derive, command: DeriveKey): CacheKeyDecision =>
  Result.match(derive(command), { onFailure: (missing: never) => missing, onSuccess: (decision) => decision })

const digestOf = (derive: Derive, command: DeriveKey): Option.Option<KeyDigest> =>
  Match.value(decisionOf(derive, command)).pipe(
    Match.tag('Keyed', (keyed) => Option.some(keyDigestOf(keyed.canonical))),
    Match.tag('Unkeyed', () => Option.none()),
    Match.exhaustive,
  )

type DeriveKeyFields = ConstructorParameters<typeof DeriveKey>[0]

const fieldsOf = (command: DeriveKey): DeriveKeyFields => ({
  mode: command.mode,
  project: command.project,
  test: command.test,
  target: command.target,
  engine: command.engine,
  engineVersion: command.engineVersion,
  app: command.app,
  instruction: command.instruction,
  params: command.params,
  agent: command.agent,
  modelId: command.modelId,
})

const withFields = (command: DeriveKey, patch: Partial<DeriveKeyFields>): DeriveKey =>
  new DeriveKey({ ...fieldsOf(command), ...patch })

const keyedCommandOf = (command: DeriveKey): DeriveKey => withFields(command, { mode: 'read-write' })

const sameDigest = (left: Option.Option<KeyDigest>, right: Option.Option<KeyDigest>): boolean =>
  Option.isSome(left) && Option.isSome(right) && left.value === right.value

const paramsWith = (params: StepParams, update: (value: ParamValue) => ParamValue): StepParams =>
  Object.fromEntries(Object.entries(params).map(([name, value]) => [name, update(value)]))

const freshNameOf = (params: StepParams): string => `fresh:${Object.keys(params).join('|')}`

const unslottedOf = (param: ParamValue): ParamValue => (isUnique(param) ? param.value : param)

const renewedOf = (suffix: string) => (param: ParamValue): ParamValue =>
  isUnique(param) ? unique(`${param.value}${suffix}#`) : param

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject => Predicate.isObject(value)

const reversedObjectOf = (object: Schema.JsonObject): Schema.JsonObject =>
  Object.fromEntries(Object.entries(object).reverse().map(([key, inner]) => [key, reversedKeysOf(inner)]))

const reversedNonArrayOf = (value: Schema.Json): Schema.Json => (isJsonObject(value) ? reversedObjectOf(value) : value)

const reversedKeysOf = (value: Schema.Json): Schema.Json =>
  Array.isArray(value) ? value.map(reversedKeysOf) : reversedNonArrayOf(value)

const reversedParamsOf = (params: StepParams): StepParams =>
  Object.fromEntries(Object.entries(params).reverse().map(([name, value]) => [name, reversedKeysOf(value)]))

it.prop(
  '∀c_DeriveKey_≡Deterministic',
  { of: [DeriveKey], subject: deriveKey, arbitrary: { seed: 498_001 } },
  (subject, [drawn]) => {
    const command = keyedCommandOf(drawn)
    const first = digestOf(subject, command)
    return sameDigest(first, digestOf(subject, command)) &&
      Option.exists(first, (digest) => /^[0-9a-f]{64}$/u.test(digest))
  },
)

it.prop(
  '∀c_DeriveKey_≠OneFieldChange',
  { of: [DeriveKey, DeriveKey], subject: deriveKey, arbitrary: { seed: 498_002 } },
  (subject, [left, right]) => {
    const base = keyedCommandOf(left)
    const baseDigest = digestOf(subject, base)
    return Arr.every(
      KEYED_FIELDS,
      (field) =>
        (JSON.stringify(base[field]) !== JSON.stringify(right[field])) ===
          !sameDigest(baseDigest, digestOf(subject, withFields(base, { [field]: right[field] }))),
    )
  },
)

it.prop(
  '∀c_DeriveKey_≠OrdinaryParamChange',
  { of: [DeriveKey, Schema.Json], subject: deriveKey, arbitrary: { seed: 498_003 } },
  (subject, [drawn, value]) => {
    const base = keyedCommandOf(drawn)
    const baseDigest = digestOf(subject, base)
    const added = { ...base.params, [freshNameOf(base.params)]: value }
    const unslotted = paramsWith(base.params, unslottedOf)
    const holdsSlot = Object.values(base.params).some(isUnique)
    return !sameDigest(baseDigest, digestOf(subject, withFields(base, { params: added }))) &&
      holdsSlot === !sameDigest(baseDigest, digestOf(subject, withFields(base, { params: unslotted })))
  },
)

it.prop(
  '∀c_DeriveKey_≡UniqueValueIgnored',
  { of: [DeriveKey, Schema.String], subject: deriveKey, arbitrary: { seed: 498_004 } },
  (subject, [drawn, suffix]) => {
    const base = keyedCommandOf(drawn)
    const renewed = paramsWith(base.params, renewedOf(suffix))
    return sameDigest(digestOf(subject, base), digestOf(subject, withFields(base, { params: renewed })))
  },
)

it.prop(
  '∀c_DeriveKey_≡ModelAndEngineVersionIgnored',
  { of: [DeriveKey, Schema.String, Schema.String], subject: deriveKey, arbitrary: { seed: 498_005 } },
  (subject, [drawn, modelId, engineVersion]) => {
    const base = keyedCommandOf(drawn)
    return sameDigest(digestOf(subject, base), digestOf(subject, withFields(base, { modelId, engineVersion })))
  },
)

it.prop(
  '∀c_DeriveKey_≡KeyedUnlessOff',
  { of: [DeriveKey], subject: deriveKey, arbitrary: { seed: 498_006 } },
  (subject, [command]) => Option.isSome(digestOf(subject, command)) === (command.mode !== 'off'),
)

it.prop(
  '∀c_DeriveKey_≡ParamKeyOrderFree',
  { of: [DeriveKey], subject: deriveKey, arbitrary: { seed: 498_008 } },
  (subject, [drawn]) => {
    const base = keyedCommandOf(drawn)
    return sameDigest(
      digestOf(subject, base),
      digestOf(subject, withFields(base, { params: reversedParamsOf(base.params) })),
    )
  },
)

it.prop(
  '∀c_DeriveKey_¬SecretValue',
  { of: [DeriveKey, Schema.String], subject: Schema.decodeUnknownResult(DeriveKey), arbitrary: { seed: 498_007 } },
  (subject, [command, secret]) =>
    Result.match(Schema.encodeResult(DeriveKey)(command), {
      onFailure: () => false,
      onSuccess: (encoded) =>
        Result.isSuccess(subject(encoded)) &&
        Result.isFailure(subject({ ...encoded, params: { ...encoded.params, password: Redacted.make(secret) } })),
    }),
)
