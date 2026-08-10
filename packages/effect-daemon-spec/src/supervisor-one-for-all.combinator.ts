import { Effect } from 'effect'
import type {
  Child,
  LockConfig,
  ReporterPolicyHooks,
  SupervisionPolicy,
  Supervisor,
  SupervisorOpts,
} from './daemon-spec.schema.js'
import { oneForAllKernel } from './supervisor-one-for-all.kernel.js'

export const oneForAll = <E, R, L extends LockConfig = LockConfig>(
  opts: SupervisorOpts<E, R, L>,
): Supervisor<E, R, L> =>
  oneForAllKernel<Child<E, R>, Effect.Effect<SupervisionPolicy>, L, ReporterPolicyHooks, SupervisorOpts<E, R, L>>(opts)
