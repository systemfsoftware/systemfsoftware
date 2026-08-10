import { SupervisorTypeId } from './brands.kernel.js'

type SupervisorRecord<CH, SP, LCK, RP, STRATEGY extends string> = {
  readonly [SupervisorTypeId]: SupervisorTypeId
  readonly name: string
  readonly strategy: STRATEGY
  readonly children: ReadonlyArray<CH>
  readonly supervision: SP
  readonly lock: LCK
  readonly reporter: RP | Record<never, never>
}

export const oneForAllKernel = <
  CH,
  SP,
  LCK,
  RP,
  O extends {
    readonly name: string
    readonly children: ReadonlyArray<CH>
    readonly supervision: SP
    readonly lock: LCK
    readonly reporter?: RP
  },
>(opts: O): SupervisorRecord<CH, SP, LCK, RP, 'one_for_all'> => ({
  [SupervisorTypeId]: SupervisorTypeId,
  name: opts.name,
  strategy: 'one_for_all',
  children: opts.children,
  supervision: opts.supervision,
  lock: opts.lock,
  reporter: opts.reporter ?? {},
})
