import { it } from '@effect/vitest'
import { refutes } from '@systemfsoftware/effect-schema-law'
import { Duration, Exit, Schema } from 'effect'
import { FastCheck as fc } from 'effect/testing'
import {
  ChildPolicyConfig,
  LockPolicyConfig,
  MaxChildren,
  SupervisorPolicyConfig,
  TickPolicyConfig,
} from '../daemon-policy.schema.js'
import { MAX_CHILDREN_CEILING } from '../supervisor-dynamic.kernel.js'

const CapOutsideSpan = Schema.Int.pipe(
  Schema.check(Schema.makeFilter((children) => children < 1 || children > MAX_CHILDREN_CEILING)),
)

const FractionalCap = Schema.Finite.pipe(
  Schema.check(Schema.isBetween({ minimum: 1, maximum: MAX_CHILDREN_CEILING })),
  Schema.check(Schema.makeFilter((children) => !Number.isInteger(children))),
)

// An over- or under-cap integer shares the integer/bound node, so it cannot
// discriminate under v4's per-node weakening; it is still a refusal contract.
it.prop(
  '∀c_CapOutsideSpan_⊥',
  [Schema.toArbitrary(CapOutsideSpan)(fc)],
  ([children]) => Exit.isFailure(Schema.decodeExit(MaxChildren)(children)),
)

refutes(MaxChildren, {
  FractionalCap: Schema.toArbitrary(FractionalCap)(fc),
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
const decodesChildRestart = Schema.decodeUnknownExit(ChildPolicyConfig)
const decodesLockMode = Schema.decodeUnknownExit(LockPolicyConfig)
const decodesTickLogLevel = Schema.decodeUnknownExit(TickPolicyConfig)

it.prop(
  '∀x_AcceptedChildRestart_→decodes',
  [fc.constantFrom('permanent', 'transient', 'temporary')],
  ([restart]) => Exit.isSuccess(decodesChildRestart({ restart })),
)

it.prop(
  '∀x_AcceptedLockMode_→decodes',
  [fc.constantFrom('none', 'required', 'optional')],
  ([mode]) => Exit.isSuccess(decodesLockMode({ mode })),
)

it.prop(
  '∀x_AcceptedStartLogLevel_→decodes',
  [fc.constantFrom('debug', 'info')],
  ([startLogLevel]) => Exit.isSuccess(decodesTickLogLevel({ startLogLevel, tickTimeout: Duration.seconds(1) })),
)

it.prop(
  '∀x_UnlistedChildRestart_→rejects',
  [fc.string().filter((s) => !['permanent', 'transient', 'temporary'].includes(s))],
  ([restart]) => Exit.isFailure(decodesChildRestart({ restart })),
)

/**
 * A rejection per class, which is what an emptied fields object fails.
 *
 * Accepting a listed value passes whether or not the field is declared - `Schema.Class` ignores an
 * unknown key - so only a rejection observes the declaration. Measured: without these two, the
 * `{}` mutant on each fields object survives.
 */
const decodesSupervisorPolicy = Schema.decodeUnknownExit(SupervisorPolicyConfig)

it.prop(
  '∀x_UnlistedLockMode_→rejects',
  [fc.string().filter((mode) => !['none', 'required', 'optional'].includes(mode))],
  ([mode]) => Exit.isFailure(decodesLockMode({ mode })),
)

it.prop(
  '∀x_NonDurationCooldown_→rejects',
  [fc.oneof(fc.string(), fc.integer(), fc.boolean())],
  ([cooldown]) => Exit.isFailure(decodesSupervisorPolicy({ cooldown })),
)
