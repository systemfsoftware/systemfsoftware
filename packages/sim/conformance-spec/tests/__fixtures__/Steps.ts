import { Conformance } from '@systemfsoftware/conformance-spec'
import { Effect } from 'effect'

export interface NamedUnit {
  readonly name: string
}

const noSteps = (): Effect.Effect<void, never, never> => Effect.void

const reachesTheRealSystem = (): Effect.Effect<void, never, never> =>
  Effect.sync(() => {
    setImmediate(() => undefined)
  })

export const neverRunningSpec: Conformance.StopSpecification<void, void, never, void, never, NamedUnit> = {
  unit: { name: 'never-running' },
  world: Effect.void,
  program: noSteps,
  restart: () => Effect.void,
  rule: () => Effect.void,
  stopWithin: '1 second',
}

export const escapingSpec: Conformance.StopSpecification<void, void, never, void, never, NamedUnit> = {
  unit: { name: 'escaping' },
  world: Effect.void,
  program: reachesTheRealSystem,
  restart: () => Effect.void,
  rule: () => Effect.void,
  stopWithin: '1 second',
}

export const leftoverChildSpec: Conformance.StopSpecification<void, void, never, void, never, NamedUnit> = {
  unit: { name: 'leftover-child' },
  world: Effect.void,
  program: () => Effect.asVoid(Effect.forkDetach(Effect.never)),
  restart: () => Effect.void,
  rule: () => Effect.void,
  stopWithin: '1 second',
}
