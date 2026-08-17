/**
 * FreePorts allocation contract (R7) — the cross-fiber exclusivity law:
 * two concurrent allocate fibers that would both pass the issue-check and
 * suspend at the SAME bind-check must never both receive the same port.
 * The check-bind-issue region runs under the allocator's promise chain
 * (the withChain pattern), so the second fiber re-reads the issued set
 * after the first one's bind-check resolved.
 *
 * No `async` anywhere (the effect language-service plugin's
 * `effect(asyncFunction)` rule): effects run through `Effect.runPromise`.
 */
import { Effect, Fiber } from 'effect'
import { describe, expect, it } from 'vitest'

import { allocate, issuedView, release } from '../free-ports.js'

describe('FreePorts allocate', () => {
  it('Should_IssueDistinctPorts_When_TwoFibersAllocateAcrossTheSameBindCheckSuspension', () => {
    const gate = Promise.withResolvers<void>()
    // A bind check that suspends until the test releases the gate: without
    // the mutex both fibers pass the issued-check for 4000, then both bind
    // it and both issue it (the double-issue race).
    const bindCheck = () => Effect.promise(() => gate.promise.then(() => true))
    const options = { candidates: [4000, 4001], bindCheck, maxAttempts: 20 }

    const program = Effect.scoped(
      Effect.gen(function*() {
        const fiberA = yield* Effect.forkScoped(allocate(1, options))
        const fiberB = yield* Effect.forkScoped(allocate(1, options))
        for (let ticks = 0; ticks < 20; ticks++) {
          yield* Effect.yieldNow
        }
        gate.resolve()
        const a = yield* Fiber.join(fiberA)
        const b = yield* Fiber.join(fiberB)
        return [a, b] as const
      }),
    )

    return Effect.runPromise(program).then(([a, b]) => {
      const ports = [...a, ...b]
      expect(ports).toHaveLength(2)
      expect(new Set(ports).size).toBe(2) // never the same port twice
      expect(issuedView().has(4000)).toBe(true)
      expect(issuedView().has(4001)).toBe(true)
      return Effect.runPromise(
        Effect.gen(function*() {
          for (const port of ports) {
            yield* release(port)
          }
        }),
      ).then(() => undefined)
    })
  })
})
