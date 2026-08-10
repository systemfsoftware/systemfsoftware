import { Effect } from 'effect'
import type {
  Child,
  LockConfig,
  ReporterPolicyHooks,
  SupervisionPolicy,
  Supervisor,
  SupervisorOpts,
} from './daemon-spec.schema.js'
import { restForOneKernel } from './supervisor-rest-for-one.kernel.js'

export const restForOne = <E, R, L extends LockConfig = LockConfig>(
  opts: SupervisorOpts<E, R, L>,
): Supervisor<E, R, L> =>
  restForOneKernel<Child<E, R>, Effect.Effect<SupervisionPolicy>, L, ReporterPolicyHooks, SupervisorOpts<E, R, L>>(opts)
