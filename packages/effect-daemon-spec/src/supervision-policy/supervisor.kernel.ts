import { SupervisorTypeId } from '../daemon-spec/brands.kernel.js'

type SupervisorRecord<CH, SP, LCK, RP, STRATEGY extends string> = {
  readonly [SupervisorTypeId]: SupervisorTypeId
  readonly name: string
  readonly strategy: STRATEGY
  readonly children: ReadonlyArray<CH>
  readonly supervision: SP
  readonly lock: LCK
  readonly reporter: RP | Record<never, never>
}

export const supervisorKernel = <
  CH,
  SP,
  LCK,
  RP,
  STRATEGY extends string,
  O extends {
    readonly name: string
    readonly children: ReadonlyArray<CH>
    readonly supervision: SP
    readonly lock: LCK
    readonly reporter?: RP
  },
>(strategy: STRATEGY, opts: O): SupervisorRecord<CH, SP, LCK, RP, STRATEGY> => ({
  [SupervisorTypeId]: SupervisorTypeId,
  name: opts.name,
  strategy,
  children: opts.children,
  supervision: opts.supervision,
  lock: opts.lock,
  reporter: opts.reporter ?? {},
})
