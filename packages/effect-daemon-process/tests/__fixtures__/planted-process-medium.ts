import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { ProcessMedium } from '@systemfsoftware/effect-daemon-process'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Effect, Layer, Scope } from 'effect'
import type * as PlatformError from 'effect/PlatformError'
import type { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process'
import { fixturePath } from './process-fixtures.js'

type PlantedShape = Supervisor.Medium.MediumPortShape<
  ChildProcess.Command,
  PlatformError.PlatformError,
  Scope.Scope | ChildProcessSpawner.ChildProcessSpawner
>

const plantedPort = Supervisor.Medium.MediumPort<
  ChildProcess.Command,
  PlatformError.PlatformError,
  Scope.Scope | ChildProcessSpawner.ChildProcessSpawner
>('PlantedProcessMedium')

const planted: Supervisor.Medium.Medium<
  ChildProcess.Command,
  PlatformError.PlatformError,
  Scope.Scope | ChildProcessSpawner.ChildProcessSpawner
> = Supervisor.Medium.make({
  declaration: ProcessMedium.declaration,
  start: () => Effect.succeed(Supervisor.Medium.started(Effect.void)),
  report: () => Effect.never,
  probe: () => Effect.succeed(true),
  stop: () => Effect.succeed(Supervisor.Medium.stopped),
})

export const plantedLayer: Layer.Layer<PlantedShape> = Layer.succeed(plantedPort, { medium: planted })

export const plantedDriver: Conformance.ConformanceDriver<
  ChildProcess.Command,
  PlatformError.PlatformError,
  ChildProcessSpawner.ChildProcessSpawner
> = {
  name: 'process-planted',
  declaration: ProcessMedium.declaration,
  port: plantedPort,
  launch: ProcessMedium.conformanceDriver({ fixturePath }).launch,
}
