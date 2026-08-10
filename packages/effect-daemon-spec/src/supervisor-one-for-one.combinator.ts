import { Effect } from 'effect'
import type {
  Child,
  LockConfig,
  ReporterPolicyHooks,
  SupervisionPolicy,
  Supervisor,
  SupervisorOpts,
} from './daemon-spec.schema.js'
import { oneForOneKernel } from './supervisor-one-for-one.kernel.js'

export const oneForOne = <E, R, L extends LockConfig = LockConfig>(
  opts: SupervisorOpts<E, R, L>,
): Supervisor<E, R, L> =>
  oneForOneKernel<Child<E, R>, Effect.Effect<SupervisionPolicy>, L, ReporterPolicyHooks, SupervisorOpts<E, R, L>>(opts)
