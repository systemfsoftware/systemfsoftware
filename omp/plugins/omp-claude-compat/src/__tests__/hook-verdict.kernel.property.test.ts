import { it } from '@effect/vitest'
import { FastCheck as fc } from 'effect'
import {
  blockReason,
  exitKindOf,
  parsedBlockReason,
  parsedVerdict,
  spokenStderr,
  stderrVerdict,
} from '../hook-verdict.kernel.js'

/**
 * The kernel's observer.
 *
 * `stryker.config.json` mutates `src/*.workflow.ts`, and `guard-mutate-scope` forbids
 * enrolling a kernel, so the decisions this file holds are outside the mutation surface.
 * Measured on the move that put them here: the package's killed-mutant count fell from 15
 * to 1 while the score stayed at 100 - a perfect score over one mutant. These laws are what
 * observes the decisions instead.
 */

const EXIT_KINDS = ['ExitBlock', 'ExitDecisionJson', 'ExitNoDecision', 'ExitOther'] as const

/** Stdout shapes that straddle the `{` test, including whitespace-padded ones. */
const stdout = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  fc.constant('{"decision":"block"}'),
  fc.constant('  {"a":1}  '),
  fc.constant('not json'),
  fc.string({ maxLength: 12 }),
)

const stderr = fc.oneof(fc.constant(''), fc.constant('   \n '), fc.string({ maxLength: 12 }))
const event = fc.string({ minLength: 1, maxLength: 10 })
const decisionKey = fc.oneof(
  fc.constant(undefined),
  fc.constant('deny'),
  fc.constant('block'),
  fc.constant('allow'),
  fc.string({ maxLength: 6 }),
)

/** Every code and output lands in the closed tag set the workflow dispatches on. */
it.prop(
  '∀c_ExitKind_∈Four',
  [fc.integer({ min: -8, max: 8 }), stdout],
  ([code, out]) => EXIT_KINDS.includes(exitKindOf(code, out)),
)

/**
 * Only exit 0 reads stdout. A mutant that inspects the output on a failing exit, or that
 * lets a `{` change a non-zero verdict, breaks this without changing any single result's
 * plausibility.
 */
it.prop(
  '∀c_NonZeroExit_=AnyStdout',
  [fc.integer({ min: -8, max: 8 }), stdout, stdout],
  ([code, a, b]) => code === 0 || exitKindOf(code, a) === exitKindOf(code, b),
)

/** Exit 0 splits on the decision-object shape and on nothing else. */
it.prop(
  '∀s_ZeroExit_≡BraceTest',
  [stdout],
  ([out]) => exitKindOf(0, out) === (out.trim().startsWith('{') ? 'ExitDecisionJson' : 'ExitNoDecision'),
)

/**
 * A blocked hook always states a reason, and states the hook's own words whenever it spoke.
 * An empty reason would surface to the user as a block with no explanation.
 */
it.prop('∀s_BlockReason_≠Empty', [stderr, event], ([err, ev]) => {
  const reason = blockReason(err, ev)
  return reason !== '' && (err.trim() === '' ? reason.includes(ev) : reason === err.trim())
})

/**
 * The two stderr readers must agree: the workflow constructs a `Warning` with
 * `spokenStderr` exactly when `stderrVerdict` says `warning`. If they disagree it emits a
 * warning carrying an empty message, which no single-function law would catch.
 */
it.prop(
  '∀s_StderrReaders_≡Agree',
  [stderr],
  ([err]) => (stderrVerdict(err) === 'warning') === (spokenStderr(err) !== ''),
)

/** The permission key shadows the legacy key whenever it is present. */
it.prop(
  '∀k_ParsedVerdict_=Permission',
  [decisionKey, decisionKey],
  ([permission, legacy]) =>
    permission === undefined || parsedVerdict(permission, legacy) === parsedVerdict(permission, undefined),
)

/**
 * A parsed block always states a reason, and reads it from the field the key implies:
 * `deny` states it in `permissionDecisionReason`, anything else in `reason`. A blank field
 * counts as absent, so the fallback names the event; a stated one is passed through
 * verbatim, spacing included.
 */
it.prop(
  '∀k_ParsedBlockReason_≠Empty',
  [decisionKey, decisionKey, decisionKey, event],
  ([key, denyReason, reason, ev]) => {
    const stated = parsedBlockReason(key, denyReason, reason, ev)
    if (stated.trim() === '') return false
    const raw = key === 'deny' ? denyReason : reason
    return raw === undefined || raw.trim() === '' ? stated.includes(ev.trim()) : stated === raw
  },
)
