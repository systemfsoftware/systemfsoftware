import { type Cause, Context, Effect, Layer } from 'effect'

export interface DaemonReporterService {
  readonly onRestart: (name: string, cause: Cause.Cause<never>) => Effect.Effect<void>
  readonly onExhausted: (name: string, cause: Cause.Cause<never>) => Effect.Effect<void>
}

export class DaemonReporter extends Context.Tag(
  '@systemfsoftware/effect-daemon-spec/daemon-reporter/DaemonReporter',
)<DaemonReporter, DaemonReporterService>() {
  static readonly Noop: Layer.Layer<DaemonReporter> = Layer.succeed(
    DaemonReporter,
    DaemonReporter.of({
      onRestart: () => Effect.void,
      onExhausted: () => Effect.void,
    }),
  )
}
