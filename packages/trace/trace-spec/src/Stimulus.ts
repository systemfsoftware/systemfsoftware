import * as OtelTracer from '@effect/opentelemetry/OtelTracer'
import { Effect, Random } from 'effect'

const BYTE_COUNT = 256

const byteHex = (byte: number): string => byte.toString(16).padStart(2, '0')

const randomByte: Effect.Effect<number> = Random.nextIntBetween(0, BYTE_COUNT - 1)

const randomHex = (byteLength: number): Effect.Effect<string> =>
  Effect.map(Effect.all(Array.from({ length: byteLength }, () => randomByte)), (bytes) => bytes.map(byteHex).join(''))

export interface TraceContext {
  readonly traceId: string
  readonly spanId: string
  readonly traceparent: string
}

export const traceContext: Effect.Effect<TraceContext> = Effect.gen(function*() {
  const traceId = yield* randomHex(16)
  const spanId = yield* randomHex(8)
  return { traceId, spanId, traceparent: `00-${traceId}-${spanId}-01` }
})

export interface Run<Input, Output> {
  readonly input: Input
  readonly traceId: string
  readonly output: Output
}

export interface Stimulus<Input, Output, E, R> {
  readonly name: string
  (input: Input): Effect.Effect<Run<Input, Output>, E, R>
}

export const make = <Input, Output, E, R>(options: {
  readonly name: string
  readonly run: (context: {
    readonly input: Input
    readonly traceId: string
    readonly traceparent: string
  }) => Effect.Effect<Output, E, R>
}): Stimulus<Input, Output, E, R> => {
  const stimulus = (input: Input): Effect.Effect<Run<Input, Output>, E, R> =>
    Effect.gen(function*() {
      const context = yield* traceContext
      const output = yield* options.run({ input, traceId: context.traceId, traceparent: context.traceparent })
        .pipe(
          Effect.withParentSpan(
            OtelTracer.makeExternalSpan({ traceId: context.traceId, spanId: context.spanId, traceFlags: 1 }),
          ),
        )
      return { input, traceId: context.traceId, output }
    })
  Object.defineProperty(stimulus, 'name', { value: options.name })
  return stimulus
}
