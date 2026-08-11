import { Effect } from 'effect'
import type {
  Child,
  LockConfig,
  PolicyBuiltFirst,
  ReporterPolicyHooks,
  SupervisionPolicy,
  Supervisor,
  SupervisorOpts,
} from '../daemon-spec/daemon-spec.schema.js'
import { supervisorKernel } from './supervisor.kernel.js'

type Strategy = Supervisor<never, never>['strategy']

const build = <E, R, L extends LockConfig>(
  strategy: Strategy,
  opts: SupervisorOpts<E, R, L>,
): Supervisor<E, R, L> =>
  supervisorKernel<
    Child<E, R>,
    Effect.Effect<SupervisionPolicy>,
    L,
    ReporterPolicyHooks,
    Strategy,
    SupervisorOpts<E, R, L>
  >(strategy, opts)

export function oneForAll<E, R, L extends LockConfig = LockConfig, S = Effect.Effect<SupervisionPolicy>>(
  opts: SupervisorOpts<E, R, L, S> & PolicyBuiltFirst<S>,
): Supervisor<E, R, L>
export function oneForAll<E, R, L extends LockConfig>(opts: SupervisorOpts<E, R, L>): Supervisor<E, R, L> {
  return build('one_for_all', opts)
}

export function oneForOne<E, R, L extends LockConfig = LockConfig, S = Effect.Effect<SupervisionPolicy>>(
  opts: SupervisorOpts<E, R, L, S> & PolicyBuiltFirst<S>,
): Supervisor<E, R, L>
export function oneForOne<E, R, L extends LockConfig>(opts: SupervisorOpts<E, R, L>): Supervisor<E, R, L> {
  return build('one_for_one', opts)
}

export function restForOne<E, R, L extends LockConfig = LockConfig, S = Effect.Effect<SupervisionPolicy>>(
  opts: SupervisorOpts<E, R, L, S> & PolicyBuiltFirst<S>,
): Supervisor<E, R, L>
export function restForOne<E, R, L extends LockConfig>(opts: SupervisorOpts<E, R, L>): Supervisor<E, R, L> {
  return build('rest_for_one', opts)
}
