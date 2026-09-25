import type { ChildScript } from './ChildScript.schema.js'
import type { ChildRole, Scenario } from './Scenario.schema.js'

const worker = (
  childId: string,
  script: ChildScript,
  overrides: Partial<ChildRole> = {},
): ChildRole => ({
  childId,
  restartType: 'permanent',
  shutdown: 'brutal',
  startTimeoutMillis: 200,
  script,
  ...overrides,
})

/**
 * The catalogue every medium is proven against. Each scenario isolates one of
 * the child-protocol behaviours a medium must reproduce: orderly exit, abnormal
 * exit and restart, an unmet start deadline, a child that ignores a graceful
 * stop, and a group restart whose stop order the group-stop guarantee governs.
 */
export const Scenarios: ReadonlyArray<Scenario> = [
  {
    name: 'ready-then-exit-normal',
    strategy: 'one_for_one',
    intensity: 0,
    periodMillis: 1_000,
    children: [worker('worker', [{ _tag: 'BecomeReady' }, { _tag: 'ExitNormal' }], { restartType: 'transient' })],
    control: [
      { _tag: 'AdvanceChild', childId: 'worker' },
      { _tag: 'AdvanceChild', childId: 'worker' },
      { _tag: 'ShutdownSupervisor' },
    ],
  },
  {
    name: 'ready-then-exit-abnormal',
    strategy: 'one_for_one',
    intensity: 0,
    periodMillis: 1_000,
    children: [worker('worker', [{ _tag: 'BecomeReady' }, { _tag: 'ExitAbnormal' }], { restartType: 'transient' })],
    control: [
      { _tag: 'AdvanceChild', childId: 'worker' },
      { _tag: 'AdvanceChild', childId: 'worker' },
      { _tag: 'ShutdownSupervisor' },
    ],
  },
  {
    name: 'never-become-ready',
    strategy: 'one_for_one',
    intensity: 0,
    periodMillis: 5_000,
    children: [
      worker('worker', [{ _tag: 'NeverBecomeReady' }], { startTimeoutMillis: 100 }),
    ],
    control: [],
  },
  {
    name: 'ignores-graceful-stop',
    strategy: 'one_for_one',
    intensity: 0,
    periodMillis: 1_000,
    children: [
      worker('worker', [{ _tag: 'BecomeReady' }, { _tag: 'IgnoreGracefulStop' }], {
        restartType: 'temporary',
        shutdown: 'graceful',
      }),
    ],
    control: [{ _tag: 'AdvanceChild', childId: 'worker' }, { _tag: 'ShutdownSupervisor' }],
  },
  {
    name: 'one-for-all-group-stop',
    strategy: 'one_for_all',
    intensity: 1,
    periodMillis: 1_000,
    children: [
      worker('alpha', [{ _tag: 'BecomeReady' }, { _tag: 'ExitAbnormal' }, { _tag: 'BecomeReady' }]),
      worker('beta', [{ _tag: 'BecomeReady' }, { _tag: 'BecomeReady' }]),
    ],
    control: [
      { _tag: 'AdvanceChild', childId: 'alpha' },
      { _tag: 'AdvanceChild', childId: 'beta' },
      { _tag: 'AdvanceChild', childId: 'alpha' },
      { _tag: 'AdvanceChild', childId: 'alpha' },
      { _tag: 'AdvanceChild', childId: 'beta' },
      { _tag: 'ShutdownSupervisor' },
    ],
  },
]
