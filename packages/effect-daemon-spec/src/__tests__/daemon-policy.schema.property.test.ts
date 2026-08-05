import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Either, FastCheck as fc, Schema } from 'effect'
import {
  ChildPolicyConfig,
  LockPolicyConfig,
  SupervisorPolicyConfig,
  TickPolicyConfig,
} from '../daemon-policy.schema.js'

const decodes = <A, I>(schema: Schema.Schema<A, I>, input: unknown): boolean =>
  Either.isRight(Schema.decodeUnknownEither(schema)(input))

const rejects = <A, I>(schema: Schema.Schema<A, I>, input: unknown): boolean =>
  Either.isLeft(Schema.decodeUnknownEither(schema)(input))

const rejectionNames = <A, I>(schema: Schema.Schema<A, I>, input: unknown, identifier: string): boolean =>
  Either.match(Schema.decodeUnknownEither(schema)(input), {
    onLeft: (error) => error.message.includes(identifier),
    onRight: () => false,
  })

const outside = (members: ReadonlyArray<string>) =>
  fc.string({ maxLength: 8 }).filter((candidate) => !members.includes(candidate))

describe('ChildPolicyConfig', () => {
  const members: ReadonlyArray<string> = ['permanent', 'transient', 'temporary']

  it.prop(
    '∀m_RestartMember_=Right',
    [fc.constantFrom(...members)],
    ([restart]) => decodes(ChildPolicyConfig, { restart }),
  )

  it.prop('∀s_RestartNonMember_=Left', [outside(members)], ([restart]) => rejects(ChildPolicyConfig, { restart }))

  it.prop(
    '∀s_RestartRejection_⊇Identifier',
    [outside(members)],
    ([restart]) => rejectionNames(ChildPolicyConfig, { restart }, 'ChildPolicyConfig'),
  )
})

describe('SupervisorPolicyConfig', () => {
  const malformed: fc.Arbitrary<unknown> = fc.constantFrom(
    { intensity: { restarts: -1 } },
    { intensity: { restarts: 0, window: 'nope' } },
    { intensity: { restarts: 1.5, window: Duration.seconds(1) } },
    { cooldown: 'nope' },
  )

  it.prop('∀v_MalformedSupervisorPolicy_=Left', [malformed], ([input]) => rejects(SupervisorPolicyConfig, input))

  it.prop(
    '∀v_SupervisorRejection_⊇Identifier',
    [malformed],
    ([input]) => rejectionNames(SupervisorPolicyConfig, input, 'SupervisorPolicyConfig'),
  )

  it.prop(
    '∀d_SupervisorPolicy_=RoundTrip',
    [fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 99 })],
    ([restarts, seconds]) =>
      decodes(SupervisorPolicyConfig, {
        intensity: { restarts, window: Duration.seconds(seconds) },
        cooldown: Duration.seconds(seconds),
      }),
  )
})

describe('LockPolicyConfig', () => {
  const members: ReadonlyArray<string> = ['none', 'required', 'optional']
  const malformed: fc.Arbitrary<unknown> = fc.constantFrom({ mode: 'nope' }, { key: 42 }, { key: null })

  it.prop('∀m_LockMode_=Right', [fc.constantFrom(...members)], ([mode]) => decodes(LockPolicyConfig, { mode }))

  it.prop('∀s_LockModeNonMember_=Left', [outside(members)], ([mode]) => rejects(LockPolicyConfig, { mode }))

  it.prop('∀v_MalformedLockPolicy_=Left', [malformed], ([input]) => rejects(LockPolicyConfig, input))

  it.prop(
    '∀v_LockRejection_⊇Identifier',
    [malformed],
    ([input]) => rejectionNames(LockPolicyConfig, input, 'LockPolicyConfig'),
  )

  it.prop(
    '∀k_LockKey_=Right',
    [fc.string({ maxLength: 16 })],
    ([key]) => decodes(LockPolicyConfig, { mode: 'optional', key }),
  )
})

describe('TickPolicyConfig', () => {
  const members: ReadonlyArray<string> = ['debug', 'info']
  const withLevel = (startLogLevel: unknown) => ({ tickTimeout: Duration.seconds(1), startLogLevel })

  it.prop(
    '∀m_StartLogLevel_=Right',
    [fc.constantFrom(...members)],
    ([level]) => decodes(TickPolicyConfig, withLevel(level)),
  )

  it.prop(
    '∀s_StartLogLevelNonMember_=Left',
    [outside(members)],
    ([level]) => rejects(TickPolicyConfig, withLevel(level)),
  )

  it.prop(
    '∀s_TickRejection_⊇Identifier',
    [outside(members)],
    ([level]) => rejectionNames(TickPolicyConfig, withLevel(level), 'TickPolicyConfig'),
  )

  it.prop(
    '∀n_MissingTickTimeout_=Left',
    [fc.constantFrom('debug', 'info')],
    ([level]) => rejects(TickPolicyConfig, { startLogLevel: level }),
  )
})
