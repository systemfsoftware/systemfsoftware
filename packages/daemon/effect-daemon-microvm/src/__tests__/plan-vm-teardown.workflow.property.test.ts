import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { it } from '@systemfsoftware/vitest'
import { Match, Schema } from 'effect'
import { absurd } from 'effect/Function'
import * as Result from 'effect/Result'
import {
  KillVm,
  PlanVmTeardown,
  planVmTeardown,
  StopVm,
  type VmTeardown,
} from '../MicroVMMedium/plan-vm-teardown.workflow.js'

type PlanTeardown = typeof planVmTeardown

const teardownOf = (plan: PlanTeardown, mode: Supervisor.Medium.ShutdownMode): VmTeardown =>
  Result.match(plan(new PlanVmTeardown({ mode })), {
    onFailure: (error: never): never => absurd(error),
    onSuccess: (teardown) => teardown,
  })

it.prop(
  '∀m_ShutdownMode_≡TeardownPlan',
  { of: [Supervisor.Medium.ShutdownMode], subject: planVmTeardown },
  (plan, [mode]) =>
    Match.value(mode).pipe(
      Match.tag('Brutal', () => Schema.is(KillVm)(teardownOf(plan, mode))),
      Match.tag(
        'Graceful',
        (graceful) =>
          Match.value(teardownOf(plan, mode)).pipe(
            Match.tag('StopVmWithin', (planned) => planned.millis === graceful.millis),
            Match.orElse(() => false),
          ),
      ),
      Match.tag('Infinity', () => Schema.is(StopVm)(teardownOf(plan, mode))),
      Match.exhaustive,
    ),
)
