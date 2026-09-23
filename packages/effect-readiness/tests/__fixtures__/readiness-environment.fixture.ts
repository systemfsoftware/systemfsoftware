import { Readiness } from '@systemfsoftware/effect-readiness'
import { Context, Effect, Layer, Ref } from 'effect'
import { type GuestService, guestService } from './guest-service.fixture.js'

export class DynamicLogStream extends Context.Service<
  DynamicLogStream,
  {
    readonly append: (line: string) => Effect.Effect<void>
  }
>()('@systemfsoftware/effect-readiness/tests/DynamicLogStream') {}

export const dynamicLogStream = (
  initialLines: ReadonlyArray<string> = [],
): Layer.Layer<Readiness.LogSource | DynamicLogStream> =>
  Layer.unwrap(
    Effect.gen(function*() {
      const buffer = yield* Ref.make(initialLines)
      const logSource = Layer.succeed(Readiness.LogSource, {
        entries: Ref.get(buffer),
      })
      const controller = Layer.succeed(DynamicLogStream, {
        append: (line: string) => Ref.update(buffer, (current) => [...current, line]),
      })
      return Layer.merge(logSource, controller)
    }),
  )

export const unreadableLogSource = (
  error: Readiness.LogSourceError,
): Layer.Layer<Readiness.LogSource | DynamicLogStream> =>
  Layer.merge(
    Layer.succeed(Readiness.LogSource, { entries: Effect.fail(error) }),
    Layer.succeed(DynamicLogStream, { append: () => Effect.void }),
  )

export const BASELINE_LOG_LINES: ReadonlyArray<string> = ['boot: starting', 'service listening on 8080']

type ScenarioEnvironment = Layer.Layer<
  Readiness.HostProber | Readiness.LogSource | DynamicLogStream | GuestService
>

const environmentOf = (
  logLayer: Layer.Layer<Readiness.LogSource | DynamicLogStream>,
): ScenarioEnvironment => Layer.mergeAll(Readiness.NodeHostProber.layer, logLayer, guestService())

export const dynamicScenarioEnvironment = (
  initialLines: ReadonlyArray<string> = [],
): ScenarioEnvironment => environmentOf(dynamicLogStream(initialLines))

export const scenarioEnvironment: ScenarioEnvironment = dynamicScenarioEnvironment(BASELINE_LOG_LINES)

export const unreadableLogEnvironment = (error: Readiness.LogSourceError): ScenarioEnvironment =>
  environmentOf(unreadableLogSource(error))
