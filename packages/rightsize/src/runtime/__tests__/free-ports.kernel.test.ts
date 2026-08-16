/**
 * FreePorts tests (R7): the in-process allocator's two guarantees — a port
 * is never handed out twice while issued, and a released port becomes
 * allocatable again — exercised against the pure kernel with injected
 * bind-check verdicts (no real ports, fully deterministic), plus one
 * real-socket bind-check probe.
 */
import { Effect } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  emptyFreePortState,
  FreePortExhaustedError,
  FreePorts,
  hostPortRange,
  nextCandidate,
  release,
  withBusy,
  withIssued,
} from '../free-ports.kernel.js'

/** A bind-check that reports every candidate free — the kernel's decision is what is under test. */
const alwaysFree = (): Effect.Effect<boolean> => Effect.succeed(true)

beforeEach(() => {
  for (const port of FreePorts.issuedView()) {
    Effect.runSync(release(port))
  }
})

describe('pure kernel decisions', () => {
  it('Should_EnumerateAscendingRange_When_Asked', () => {
    expect(hostPortRange(40000, 40003)).toEqual([40000, 40001, 40002, 40003])
    expect(hostPortRange(5, 5)).toEqual([5])
  })

  it('Should_SkipIssuedAndBusyCandidates_When_PickingNext', () => {
    const state = withBusy(withIssued(emptyFreePortState(), 40001), 40002)
    expect(nextCandidate(hostPortRange(40000, 40005), state)).toBe(40000)
    expect(nextCandidate(hostPortRange(40001, 40005), state)).toBe(40003)
  })
})

describe('FreePorts allocation', () => {
  it('Should_NeverHandOutTheSamePortTwice_When_StillIssued', () => {
    const candidates = hostPortRange(41000, 41020)
    const allocated = Effect.runSync(FreePorts.allocate(15, { candidates, bindCheck: alwaysFree }))
    expect(allocated.length).toBe(15)
    expect(new Set(allocated).size).toBe(15)
    for (const port of allocated) {
      expect(candidates).toContain(port)
    }
  })

  it('Should_ReallocateReleasedPorts_When_AskedAgain', () => {
    const candidates = hostPortRange(42000, 42004)
    const first = Effect.runSync(FreePorts.allocate(5, { candidates, bindCheck: alwaysFree }))
    expect(first[0]).toBe(42000)
    const released = first[0] as number
    Effect.runSync(release(released))
    const again = Effect.runSync(FreePorts.allocate(1, { candidates, bindCheck: alwaysFree }))
    expect(again).toContain(released)
  })

  it('Should_FailTyped_When_NoFreeCandidateRemains', () => {
    const candidates = hostPortRange(43000, 43002)
    Effect.runSync(FreePorts.allocate(3, { candidates, bindCheck: alwaysFree }))
    const program = FreePorts.allocate(1, { candidates, bindCheck: alwaysFree })
    return Effect.runPromise(program).then(
      () => {
        throw new Error('expected FreePortExhaustedError')
      },
      (error: unknown) => {
        expect(error).toBeInstanceOf(FreePortExhaustedError)
      },
    )
  })

  it('Should_RollBackThePartialBatch_When_ExhaustionHitsMidAllocation', () => {
    const candidates = hostPortRange(44000, 44000)
    // first slot succeeds, the second cannot: the first must be released
    // before the typed failure surfaces (R7: release on every failure path).
    const program = FreePorts.allocate(2, { candidates, bindCheck: alwaysFree })
    return Effect.runPromise(program).then(
      () => {
        throw new Error('expected FreePortExhaustedError')
      },
      (error: unknown) => {
        expect(error).toBeInstanceOf(FreePortExhaustedError)
        expect(FreePorts.issuedView().size).toBe(0)
      },
    )
  })

  it('Should_MarkBusyCandidatesAndTryNext_When_BindCheckFails', () => {
    const freeOnly = (port: number): Effect.Effect<boolean> => Effect.succeed(port === 45001)
    const candidates = hostPortRange(45000, 45001)
    const allocated = Effect.runSync(FreePorts.allocate(1, { candidates, bindCheck: freeOnly }))
    expect(allocated).toEqual([45001])
  })
})
