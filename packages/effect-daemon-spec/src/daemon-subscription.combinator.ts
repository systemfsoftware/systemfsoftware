import { Effect } from 'effect'
import type { ChildPolicyConfig, TickPolicyConfig } from './daemon-spec/daemon-policy.schema.js'
import type { CommonOpts, LockConfig, TickPolicyHooks, Worker } from './daemon-spec/daemon-spec.schema.js'
import { subscriptionKernel } from './daemon-subscription.kernel.js'

export const subscription = <A, E, R, L extends LockConfig>(
  opts: CommonOpts<L> & { readonly acquire: Effect.Effect<A, E, R> },
): Worker<E, R, L> =>
  subscriptionKernel<
    E,
    R,
    Effect.Effect<A, E, R>,
    TickPolicyConfig,
    TickPolicyHooks,
    ChildPolicyConfig,
    L,
    CommonOpts<L> & {
      readonly name: string
      readonly acquire: Effect.Effect<A, E, R>
      readonly tick: TickPolicyConfig
      readonly tickHooks?: TickPolicyHooks
      readonly child?: ChildPolicyConfig
      readonly lock: L
    }
  >(opts)
