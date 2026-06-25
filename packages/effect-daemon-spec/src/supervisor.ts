import type { Effect } from 'effect'
import type {
  Child,
  DynamicSpec,
  LockConfig,
  ReporterPolicyHooks,
  Supervisor as SupervisorT,
  Worker,
} from './daemon-spec.js'
import { DynamicSpecTypeId, SupervisorTypeId } from './daemon-spec.js'
import type { SupervisionPolicy } from './supervision-preset.js'

export interface SupervisorOpts<E, R, L extends LockConfig> {
  readonly name: string
  readonly children: ReadonlyArray<Child<E, R>>
  readonly supervision: Effect.Effect<SupervisionPolicy>
  readonly lock: L
  readonly reporter?: ReporterPolicyHooks
}

const makeSupervisor = <E, R, L extends LockConfig>(
  opts: SupervisorOpts<E, R, L>,
  strategy: SupervisorT<E, R>['strategy'],
): SupervisorT<E, R, L> => ({
  [SupervisorTypeId]: SupervisorTypeId,
  name: opts.name,
  strategy,
  children: opts.children,
  supervision: opts.supervision,
  lock: opts.lock,
  reporter: opts.reporter ?? {},
})

export const oneForOne = <E, R, L extends LockConfig = LockConfig>(
  opts: SupervisorOpts<E, R, L>,
): SupervisorT<E, R, L> => makeSupervisor(opts, 'one_for_one')
export const oneForAll = <E, R, L extends LockConfig = LockConfig>(
  opts: SupervisorOpts<E, R, L>,
): SupervisorT<E, R, L> => makeSupervisor(opts, 'one_for_all')
export const restForOne = <E, R, L extends LockConfig = LockConfig>(
  opts: SupervisorOpts<E, R, L>,
): SupervisorT<E, R, L> => makeSupervisor(opts, 'rest_for_one')

export const dynamic = <E, R, Args>(opts: {
  readonly name: string
  readonly child: (args: Args) => Worker<E, R>
  readonly maxChildren?: number
}): DynamicSpec<E, R, Args> => ({
  [DynamicSpecTypeId]: DynamicSpecTypeId,
  name: opts.name,
  child: opts.child,
  maxChildren: opts.maxChildren ?? 1000,
})
