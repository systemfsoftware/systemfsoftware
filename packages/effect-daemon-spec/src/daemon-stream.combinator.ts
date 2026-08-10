import type { Stream } from 'effect'
import type { ChildPolicyConfig, TickPolicyConfig } from './daemon-spec/daemon-policy.schema.js'
import type { CommonOpts, LockConfig, TickPolicyHooks, Worker } from './daemon-spec/daemon-spec.schema.js'
import { streamKernel } from './daemon-stream.kernel.js'

export const stream = <A, E, R, L extends LockConfig>(
  opts: CommonOpts<L> & { readonly stream: Stream.Stream<A, E, R> },
): Worker<E, R, L> =>
  streamKernel<
    Stream.Stream<A, E, R>,
    TickPolicyConfig,
    TickPolicyHooks,
    ChildPolicyConfig,
    L,
    CommonOpts<L> & {
      readonly name: string
      readonly stream: Stream.Stream<A, E, R>
      readonly tick: TickPolicyConfig
      readonly tickHooks?: TickPolicyHooks
      readonly child?: ChildPolicyConfig
      readonly lock: L
    }
  >(opts)
