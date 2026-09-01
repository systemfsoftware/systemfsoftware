import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

export const workerSocketPath = (label: string): string => {
  const socketPath = process.env['STRYKER_SOCKET']
  if (socketPath === undefined) {
    process.stderr.write(`${label}: STRYKER_SOCKET is not set\n`)
    process.exit(1)
  }
  return socketPath
}

export const launchWorker = (main: Layer.Layer<never, unknown, never>, label: string): void => {
  Effect.runFork(
    Layer.launch(main).pipe(
      Effect.tapCause((cause) =>
        Effect.sync(() => {
          process.stderr.write(`${label}: ${Cause.pretty(cause)}\n`)
          process.exitCode = 1
        })
      ),
    ),
  )
}
