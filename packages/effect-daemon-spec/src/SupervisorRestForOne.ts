import { SupervisorTypeId } from './Brands.js'

type SupervisorRecord<CH, SP, LCK, RP, STRATEGY extends string> = {
  readonly [SupervisorTypeId]: SupervisorTypeId
  readonly name: string
  readonly strategy: STRATEGY
  readonly children: readonly CH[]
  readonly supervision: SP
  readonly lock: LCK
  readonly reporter: RP | Record<never, never>
}

export const restForOne = <
  CH,
  SP,
  LCK,
  RP,
  O extends {
    readonly name: string
    readonly children: readonly CH[]
    readonly supervision: SP
    readonly lock: LCK
    readonly reporter?: RP
  },
>(opts: O): SupervisorRecord<CH, SP, LCK, RP, 'rest_for_one'> => ({
  [SupervisorTypeId]: SupervisorTypeId,
  name: opts.name,
  strategy: 'rest_for_one',
  children: opts.children,
  supervision: opts.supervision,
  lock: opts.lock,
  reporter: opts.reporter ?? {},
})
