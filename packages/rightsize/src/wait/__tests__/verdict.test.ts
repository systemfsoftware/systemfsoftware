/**
 * Verdict-kernel properties (R11) — the one-round rule and the round-sequence
 * fold, both against independently-written references. The interpreter's WHOLE
 * loop is a fold over `decideVerdict` rounds, so the sequence property below
 * is the exact decision surface the runtime behavior reduces to: a successful
 * probe wins outright, a failing probe times out the first time the deadline
 * is crossed, otherwise the loop continues.
 *
 * Verdict discipline: every predicate is a pure boolean — no `expect` inside
 * a property predicate, and per-case cost is bounded by the draw itself.
 */
import { it } from '@effect/vitest'
import { FastCheck as fc } from 'effect/testing'
import { decideVerdict } from '../verdict.js'
import type { WaitVerdict } from '../verdict.js'

type Round = { readonly probeOk: boolean; readonly elapsedMs: number }

/** One round: the probe outcome, the elapsed time and the deadline are independent of each other. */
const roundArb: fc.Arbitrary<Round & { readonly timeoutMs: number }> = fc.record({
  probeOk: fc.boolean(),
  elapsedMs: fc.integer({ min: 0, max: 5_000 }),
  timeoutMs: fc.integer({ min: 1, max: 2_000 }),
})

/**
 * The one-round spec: a successful probe is Ready even at/after the deadline
 * (the do-while one-shot); a failed probe Times out exactly when the deadline
 * is crossed (>=, inclusive); before the deadline it Continues.
 */
const oneRoundSpec = (
  round: { readonly probeOk: boolean; readonly elapsedMs: number; readonly timeoutMs: number },
): boolean => {
  const verdict = decideVerdict({
    probeOk: round.probeOk,
    elapsedMs: round.elapsedMs,
    timeoutMs: round.timeoutMs,
    tail: '',
  })
  if (round.probeOk) {
    return verdict._tag === 'Ready'
  }
  if (round.elapsedMs >= round.timeoutMs) {
    return verdict._tag === 'Timeout' && verdict.tail === ''
  }
  return verdict._tag === 'Continue'
}

it.prop(
  '∀(probeOk,elapsed,timeout)_Verdict_=Spec',
  [roundArb],
  ([round]) => oneRoundSpec(round),
)

/**
 * The Timeout verdict carries the caller's gathered tail through unchanged —
 * the interpreter fills the tail at the deadline crossing and the kernel
 * shapes the final verdict from it.
 */
it.prop(
  '∀c_TailTimeout_=Gathered',
  [roundArb, fc.string({ maxLength: 64 })],
  ([round, tail]) => {
    const verdict = decideVerdict({
      probeOk: false,
      elapsedMs: Math.max(round.elapsedMs, round.timeoutMs),
      timeoutMs: round.timeoutMs,
      tail,
    })
    return verdict._tag === 'Timeout' && verdict.tail === tail
  },
)

/**
 * Poll sequences — the interpreter's rounds, generated with a monotone
 * elapsed clock. `foldWithKernel` walks the rounds through the kernel exactly
 * as the interpreter does; `referenceVerdict` is written independently from
 * the round data (first success wins; first deadline crossing times out).
 * The property: both decide the same outcome, in the same order.
 */
const roundsArb: fc.Arbitrary<readonly Round[]> = fc
  .array(fc.record({ probeOk: fc.boolean(), stepMs: fc.integer({ min: 0, max: 1_500 }) }), {
    minLength: 1,
    maxLength: 10,
  })
  .map((rounds) => {
    let elapsed = 0
    return rounds.map((round) => {
      elapsed = elapsed + round.stepMs
      return { probeOk: round.probeOk, elapsedMs: elapsed }
    })
  })

/** The interpreter's fold: walk the rounds, first non-Continue verdict wins. */
const foldWithKernel = (rounds: readonly Round[], timeoutMs: number): WaitVerdict => {
  for (const round of rounds) {
    const verdict = decideVerdict({ probeOk: round.probeOk, elapsedMs: round.elapsedMs, timeoutMs, tail: '' })
    if (verdict._tag !== 'Continue') {
      return verdict
    }
  }
  return { _tag: 'Continue' }
}

/** The independent reference: the first successful probe wins; failing probes lose at the first deadline crossing; otherwise continue. */
const referenceVerdict = (rounds: readonly Round[], timeoutMs: number): WaitVerdict => {
  for (const round of rounds) {
    if (round.probeOk) {
      return { _tag: 'Ready' }
    }
    if (round.elapsedMs >= timeoutMs) {
      return { _tag: 'Timeout', tail: '' }
    }
  }
  return { _tag: 'Continue' }
}

it.prop(
  '∀rounds_Fold_=Reference',
  [roundsArb, fc.integer({ min: 250, max: 3_000 })],
  ([rounds, timeoutMs]) => {
    const got = foldWithKernel(rounds, timeoutMs)
    const want = referenceVerdict(rounds, timeoutMs)
    if (got._tag === 'Timeout' && want._tag === 'Timeout') {
      return got.tail === want.tail
    }
    return got._tag === want._tag
  },
)

/**
 * The fold's order-sensitivity: the first Ready in the sequence wins even
 * when a LATER round would have crossed the deadline — Ready decisions are
 * not shadowed by an earlier Timeout (which cannot happen — the interpreter
 * stops at the first non-Continue — so this pins that the fold returns the
 * FIRST non-Continue verdict, not the last).
 */
it.prop(
  '∀rounds_FirstNonContinue_=Winner',
  [roundsArb, fc.integer({ min: 250, max: 3_000 })],
  ([rounds, timeoutMs]) => {
    const winner = foldWithKernel(rounds, timeoutMs)
    if (winner._tag === 'Continue') {
      return true // no decisive round: every round failed before the deadline
    }
    const firstIndex = rounds.findIndex((round) => round.probeOk || round.elapsedMs >= timeoutMs)
    if (firstIndex === -1) {
      return false // a verdict without any decisive round is impossible
    }
    if (rounds[firstIndex]?.probeOk === true) {
      return winner._tag === 'Ready'
    }
    return winner._tag === 'Timeout'
  },
)
