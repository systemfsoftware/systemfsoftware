import { type Cause, Context, Effect, Layer } from 'effect'

/** @public */
export interface DaemonReporterService {
  readonly onRestart: (name: string, cause: Cause.Cause<never>) => Effect.Effect<void>
  readonly onExhausted: (name: string, cause: Cause.Cause<never>) => Effect.Effect<void>
}

/** @public */
export class DaemonReporter extends Context.Service<DaemonReporter, DaemonReporterService>()(
  '@systemfsoftware/effect-daemon-spec/DaemonReporterAdapter/DaemonReporter',
) {}

/** @public */
export const Noop: Layer.Layer<DaemonReporter> = Layer.succeed(
  DaemonReporter,
  DaemonReporter.of({
    onRestart: () => Effect.void,
    onExhausted: () => Effect.void,
  }),
)
