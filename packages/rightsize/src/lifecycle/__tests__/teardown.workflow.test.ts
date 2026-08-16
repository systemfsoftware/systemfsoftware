/**
 * Teardown-workflow tests — the ordered plan, idempotency, applicability
 * conditions, and the contradiction error channel (R5, F2).
 *
 * The decision is pure: every test builds the recorded-facts command
 * directly and calls `decideTeardown` synchronously — no services, no
 * ledger, no registry (zero I/O by construction).
 */
import { Option, Result } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  decideTeardown,
  TEARDOWN_STEP_ORDER,
  type TeardownCommand,
  TeardownCompleted,
  TeardownFactContradictionError,
  TeardownSkipped,
  type TeardownStep,
  TeardownSteps,
} from '../teardown.workflow.js'

/** The canonical full-member command: started, on the library network as last member, registered, tracked, ports issued. */
const fullTeardownCommand = (
  overrides: Partial<Omit<Extract<TeardownCommand, { readonly _tag: 'TearDown' }>, '_tag'>> = {},
): TeardownCommand => ({
  _tag: 'TearDown',
  keepAlive: false,
  adopted: false,
  created: true,
  completed: [],
  networkId: 'rz-net-1234abcd',
  isLastNetworkMember: true,
  syncCleanupRegistered: true,
  ledgerTracked: true,
  portsIssued: true,
  ...overrides,
})

const expectSteps = (input: TeardownCommand, steps: ReadonlyArray<TeardownStep>) => {
  const decision = decideTeardown(input)
  expect(Result.isSuccess(decision)).toBe(true)
  const decided = Result.getOrThrow(decision)
  expect(decided).toBeInstanceOf(TeardownSteps)
  expect((decided as TeardownSteps).steps).toEqual([...steps])
}

describe('decideTeardown — the fixed ordered plan (R5: stop → remove → network-remove → sync-unregister → untrack → release-ports)', () => {
  it('Should_PlanEveryStepInOrder_When_EverythingApplies', () => {
    expectSteps(fullTeardownCommand(), TEARDOWN_STEP_ORDER)
  })

  it('Should_PlanSubset_When_NoNetworkJoined', () => {
    expectSteps(fullTeardownCommand({ networkId: undefined }), [
      'stop',
      'remove',
      'sync-unregister',
      'untrack',
      'release-ports',
    ])
  })

  it('Should_OmitNetworkRemove_When_NotTheLastNetworkMember', () => {
    expectSteps(fullTeardownCommand({ isLastNetworkMember: false }), [
      'stop',
      'remove',
      'sync-unregister',
      'untrack',
      'release-ports',
    ])
  })

  it('Should_OmitStopAndRemove_When_NothingWasCreated', () => {
    // The network was ensured before create, so last-member network removal
    // still applies — only stop/remove are meaningless without a handle.
    expectSteps(fullTeardownCommand({ created: false }), [
      'network-remove',
      'sync-unregister',
      'untrack',
      'release-ports',
    ])
  })

  it('Should_OmitUnregisterAndUntrackAndPorts_When_NeverRegisteredTrackedIssued', () => {
    expectSteps(
      fullTeardownCommand({ syncCleanupRegistered: false, ledgerTracked: false, portsIssued: false }),
      ['stop', 'remove', 'network-remove'],
    )
  })
})

describe('decideTeardown — idempotency (the no-op second run)', () => {
  it('Should_PlanFullOrderThenNoopSecond_When_AllStepsReportedCompleted', () => {
    const first = decideTeardown(fullTeardownCommand())
    expect(Result.isSuccess(first)).toBe(true)
    const planned = Result.getOrThrow(first)
    expect(planned).toBeInstanceOf(TeardownSteps)

    // The executor runs the plan in order and records completion; the same
    // snapshot with every step reported yields the no-op second run.
    const second = decideTeardown(fullTeardownCommand({ completed: (planned as TeardownSteps).steps }))
    expect(Result.isSuccess(second)).toBe(true)
    expect(Result.getOrThrow(second)).toBeInstanceOf(TeardownCompleted)
  })

  it('Should_ResumeFromInitialSegment_When_InterruptedAfterTwoSteps', () => {
    // Teardown ran stop → remove, then the process was interrupted; the
    // resumed decision must plan exactly the remaining four steps.
    expectSteps(fullTeardownCommand({ completed: ['stop', 'remove'] }), [
      'network-remove',
      'sync-unregister',
      'untrack',
      'release-ports',
    ])
  })

  it('Should_ReportCompleted_When_NothingEverApplied', () => {
    const decision = decideTeardown(
      fullTeardownCommand({
        created: false,
        networkId: undefined,
        syncCleanupRegistered: false,
        ledgerTracked: false,
        portsIssued: false,
      }),
    )
    expect(Result.isSuccess(decision)).toBe(true)
    expect(Result.getOrThrow(decision)).toBeInstanceOf(TeardownCompleted)
  })
})

describe('decideTeardown — exemptions (R5)', () => {
  it('Should_Skip_When_KeepAliveContainer', () => {
    const decision = decideTeardown(fullTeardownCommand({ keepAlive: true, completed: [] }))
    expect(Result.isSuccess(decision)).toBe(true)
    expect(Result.getOrThrow(decision)).toBeInstanceOf(TeardownSkipped)
  })

  it('Should_Skip_When_ReuseAdoptedContainer', () => {
    const decision = decideTeardown(fullTeardownCommand({ adopted: true, completed: [] }))
    expect(Result.isSuccess(decision)).toBe(true)
    expect(Result.getOrThrow(decision)).toBeInstanceOf(TeardownSkipped)
  })
})

describe('decideTeardown — contradiction channel (executor-bug contracts)', () => {
  const expectContradiction = (input: TeardownCommand) => {
    const decision = decideTeardown(input)
    expect(Result.isFailure(decision)).toBe(true)
    const failureOption = Result.getFailure(decision)
    expect(Option.isSome(failureOption)).toBe(true)
    expect(Option.getOrThrow(failureOption)).toBeInstanceOf(TeardownFactContradictionError)
  }

  it('Should_Fail_When_StopReportedCompletedWithoutCreate', () => {
    expectContradiction(fullTeardownCommand({ created: false, completed: ['stop'] }))
  })

  it('Should_Fail_When_NetworkRemoveReportedWithoutNetwork', () => {
    expectContradiction(fullTeardownCommand({ networkId: undefined, completed: ['network-remove'] }))
  })

  it('Should_Fail_When_UnregisterReportedButNeverRegistered', () => {
    expectContradiction(fullTeardownCommand({ syncCleanupRegistered: false, completed: ['sync-unregister'] }))
  })

  it('Should_Fail_When_PortsReleaseReportedWithoutIssuedPorts', () => {
    expectContradiction(fullTeardownCommand({ portsIssued: false, completed: ['release-ports'] }))
  })

  it('Should_Fail_When_StepsRecordedOutOfTheFixedOrder', () => {
    // 'remove' completed before 'stop' — the executor skipped ahead.
    expectContradiction(fullTeardownCommand({ completed: ['remove'] }))
  })

  it('Should_Fail_When_StepsRecordedOnAnExemptContainer', () => {
    expectContradiction(fullTeardownCommand({ keepAlive: true, completed: ['stop'] }))
    expectContradiction(fullTeardownCommand({ adopted: true, completed: ['remove'] }))
  })
})
