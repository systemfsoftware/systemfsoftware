import { Tracer } from 'effect'

/**
 * A tracer that keeps every span a program opens, in the order they began. It is the tracing harness for a package
 * that sits below `@systemfsoftware/trace-spec` in the dependency graph and whose published behaviour is the spans
 * it emits; every other package asserts spans through a trace suite.
 */
export interface SpanRecorder {
  readonly tracer: Tracer.Tracer
  readonly spans: ReadonlyArray<Tracer.NativeSpan>
}

export const make = (): SpanRecorder => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  return { tracer, spans }
}
