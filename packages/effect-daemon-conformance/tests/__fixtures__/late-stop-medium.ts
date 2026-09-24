import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Array as Arr, Effect, Layer, type Scope } from 'effect'
import type { ConformanceDriver } from '../../src/driver.js'
import { FiberReference } from '../../src/FiberReference.js'

const LATE_HOPS = 3

const lateHops = (): Effect.Effect<void> =>
  Effect.forEach(Arr.range(1, LATE_HOPS), () => Effect.yieldNow, { discard: true })

const medium = (): Supervisor.Medium.Medium<Supervisor.FiberProgram, never, Scope.Scope> => ({
  ...Supervisor.FiberMedium.medium,
  stop: (evidence, mode) => Effect.andThen(lateHops(), Supervisor.FiberMedium.medium.stop(evidence, mode)),
})

const port = Supervisor.Medium.MediumPort<Supervisor.FiberProgram, never, Scope.Scope>('LateStopMedium')

export const LateStopMedium: ConformanceDriver<Supervisor.FiberProgram, never, never> = {
  name: 'late-stop',
  declaration: { reporting: 'full', groupStop: 'atomic' },
  port,
  launch: FiberReference.launch,
}

export const LateStopMediumLayer: Layer.Layer<
  Supervisor.Medium.MediumPortShape<Supervisor.FiberProgram, never, Scope.Scope>
> = Layer.succeed(port, { medium: medium() })
