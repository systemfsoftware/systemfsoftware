/**
 * The run recorder: an in-memory {@link Tracer.Tracer} that keeps every span one run opened (KTD2). Nothing is
 * exported from a recorder — its spans are read in process by the failure renderer and dropped with the run.
 *
 * A recorder is per run: the kernel's baseline, each seeded run and each replay each get their own, and so does
 * every program the runner drives. Installing it is the caller's job, through `Effect.withTracer`.
 *
 * @since 4.0.0
 */
import * as Tracer from 'effect/Tracer'

/** @internal */
export interface SpanRecorder {
  readonly tracer: Tracer.Tracer
  readonly spans: ReadonlyArray<Tracer.NativeSpan>
}

/** @internal */
export const createSpanRecorder = (): SpanRecorder => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  return { tracer, spans }
}
