import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Result from 'effect/Result'
import { DrawnDecisionError } from './DrawnDecision.workflow.js'

export interface TraceRecorderService {
  readonly record: (phase: string) => Effect.Effect<void>
  readonly recordSync: (phase: string) => void
  readonly writeObserved: (value: number) => Effect.Effect<void>
  readonly writeObservedSync: (value: number) => void
  readonly encodeObserved: (outcome: Result.Result<number, DrawnDecisionError>) => Effect.Effect<void>
  readonly encodeObservedSync: (outcome: Result.Result<number, DrawnDecisionError>) => void
  readonly getTrace: Effect.Effect<readonly string[]>
  readonly getWriteObserved: Effect.Effect<readonly number[]>
  readonly getEncodeObserved: Effect.Effect<readonly Result.Result<number, DrawnDecisionError>[]>
}

export class TraceRecorder extends Context.Service<TraceRecorder, TraceRecorderService>()('TraceRecorder') {}

export const make: Effect.Effect<TraceRecorderService> = Effect.sync(() => {
  const trace: Array<string> = []
  const writeObserved: Array<number> = []
  const encodeObserved: Array<Result.Result<number, DrawnDecisionError>> = []

  return {
    record: (phase: string) =>
      Effect.sync(() => {
        trace.push(phase)
      }),
    recordSync: (phase: string): void => {
      trace.push(phase)
    },
    writeObserved: (value: number) =>
      Effect.sync(() => {
        writeObserved.push(value)
      }),
    writeObservedSync: (value: number): void => {
      writeObserved.push(value)
    },
    encodeObserved: (outcome: Result.Result<number, DrawnDecisionError>) =>
      Effect.sync(() => {
        encodeObserved.push(outcome)
      }),
    encodeObservedSync: (outcome: Result.Result<number, DrawnDecisionError>): void => {
      encodeObserved.push(outcome)
    },
    getTrace: Effect.sync(() => [...trace] as const),
    getWriteObserved: Effect.sync(() => [...writeObserved] as const),
    getEncodeObserved: Effect.sync(() => [...encodeObserved] as const),
  }
})

export const layer: Layer.Layer<TraceRecorder> = Layer.effect(TraceRecorder, make)
