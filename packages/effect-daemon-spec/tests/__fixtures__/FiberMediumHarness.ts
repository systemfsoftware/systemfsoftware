import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Layer, Scope } from 'effect'

export const fiberMediumLayer: Layer.Layer<
  Supervisor.Medium.MediumPortShape<Supervisor.FiberProgram, never, Scope.Scope>
> = Layer.succeed(Supervisor.FiberMedium.fiberPort, { medium: Supervisor.FiberMedium.medium })
