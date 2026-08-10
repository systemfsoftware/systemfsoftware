import { Effect } from 'effect'
import { pollKernel } from './daemon-poll.kernel.js'
import type { ChildPolicyConfig, TickPolicyConfig } from './daemon-spec/daemon-policy.schema.js'
import type { LockConfig, PollOpts, TickPolicyHooks, Worker } from './daemon-spec/daemon-spec.schema.js'

export const poll = <A, E, R, L extends LockConfig>(opts: PollOpts<A, E, R, L>): Worker<E, R, L> =>
  pollKernel<
    Effect.Effect<A, E, R>,
    A,
    E,
    R,
    TickPolicyConfig,
    TickPolicyHooks,
    ChildPolicyConfig,
    L,
    PollOpts<A, E, R, L>
  >(opts)
