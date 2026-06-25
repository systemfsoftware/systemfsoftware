import { Cause, Effect, Layer, Ref } from 'effect'
import { DaemonReporter } from '../../daemon-reporter.js'

export const ReporterSpyContext = Effect.gen(function*() {
  const restartsRef = yield* Ref.make<Array<{ name: string; cause: Cause.Cause<unknown> }>>([])
  const exhaustionsRef = yield* Ref.make<Array<{ name: string; cause: Cause.Cause<unknown> }>>([])
  return {
    reporter: DaemonReporter.of({
      onRestart: (name, cause) => Ref.update(restartsRef, (r) => [...r, { name, cause }]).pipe(Effect.as(void 0)),
      onExhausted: (name, cause) => Ref.update(exhaustionsRef, (e) => [...e, { name, cause }]).pipe(Effect.as(void 0)),
    }),
    getRestarts: () => Ref.get(restartsRef),
    getExhaustions: () => Ref.get(exhaustionsRef),
  }
})

export const SpyLayer = Layer.effect(DaemonReporter, ReporterSpyContext.pipe(Effect.map((s) => s.reporter)))
