import { it } from '@effect/vitest'
import { refutes } from '@systemfsoftware/effect-schema-law'
import { Arbitrary, Duration, Either, FastCheck as fc, Schema } from 'effect'
import {
  ChildPolicyConfig,
  LockPolicyConfig,
  MaxChildren,
  SupervisorPolicyConfig,
  TickPolicyConfig,
} from '../daemon-policy.schema.js'
import { MAX_CHILDREN_CEILING } from '../supervisor-dynamic.kernel.js'

const CapOutsideSpan = Schema.Int.pipe(
  Schema.filter((children) => children < 1 || children > MAX_CHILDREN_CEILING),
)

const FractionalCap = Schema.Number.pipe(
  Schema.between(1, MAX_CHILDREN_CEILING),
  Schema.filter((children) => !Number.isInteger(children)),
)

refutes(MaxChildren, {
  CapOutsideSpan: Arbitrary.make(CapOutsideSpan),
  FractionalCap: Arbitrary.make(FractionalCap),
})

/**
 * The accepted value set of each policy field, written down rather than drawn from the schema.
 *
 * An arbitrary derived from the schema cannot police this: shrink the literal union to one member
 * and the generator shrinks with it, so the round-trip law still passes. Measured - these three
 * properties are what turn the `Schema.Literal` mutants in this cell from survivors into kills,
 * and the accepted set is a decision rather than declaration data, which is why no ignorer covers
 * it.
 */
const decodesChildRestart = Schema.decodeUnknownEither(ChildPolicyConfig)
const decodesLockMode = Schema.decodeUnknownEither(LockPolicyConfig)
const decodesTickLogLevel = Schema.decodeUnknownEither(TickPolicyConfig)

it.prop(
  '∀x_AcceptedChildRestart_→decodes',
  [fc.constantFrom('permanent', 'transient', 'temporary')],
  ([restart]) => Either.isRight(decodesChildRestart({ restart })),
)

it.prop(
  '∀x_AcceptedLockMode_→decodes',
  [fc.constantFrom('none', 'required', 'optional')],
  ([mode]) => Either.isRight(decodesLockMode({ mode })),
)

it.prop(
  '∀x_AcceptedStartLogLevel_→decodes',
  [fc.constantFrom('debug', 'info')],
  ([startLogLevel]) => Either.isRight(decodesTickLogLevel({ startLogLevel, tickTimeout: Duration.seconds(1) })),
)

it.prop(
  '∀x_UnlistedChildRestart_→rejects',
  [fc.string().filter((s) => !['permanent', 'transient', 'temporary'].includes(s))],
  ([restart]) => Either.isLeft(decodesChildRestart({ restart })),
)

/**
 * A rejection per class, which is what an emptied fields object fails.
 *
 * Accepting a listed value passes whether or not the field is declared - `Schema.Class` ignores an
 * unknown key - so only a rejection observes the declaration. Measured: without these two, the
 * `{}` mutant on each fields object survives.
 */
const decodesSupervisorPolicy = Schema.decodeUnknownEither(SupervisorPolicyConfig)

it.prop(
  '∀x_UnlistedLockMode_→rejects',
  [fc.string().filter((mode) => !['none', 'required', 'optional'].includes(mode))],
  ([mode]) => Either.isLeft(decodesLockMode({ mode })),
)

it.prop(
  '∀x_NonDurationCooldown_→rejects',
  [fc.oneof(fc.string(), fc.integer(), fc.boolean())],
  ([cooldown]) => Either.isLeft(decodesSupervisorPolicy({ cooldown })),
)
