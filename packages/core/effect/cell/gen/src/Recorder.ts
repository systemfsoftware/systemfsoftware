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

/**
 * The arrays several recorder-backed specs share when a property needs one trace
 * across a composed Cell. A spec that owns its arrays passes nothing.
 */
export interface RecorderArrays {
  readonly trace: Array<string>
  readonly writeObserved: Array<number>
  readonly encodeObserved: Array<Result.Result<number, DrawnDecisionError>>
}

export const recorderServiceOver = (
  arrays: RecorderArrays = { trace: [], writeObserved: [], encodeObserved: [] },
): TraceRecorderService => ({
  record: (phase: string) =>
    Effect.sync(() => {
      arrays.trace.push(phase)
    }),
  recordSync: (phase: string): void => {
    arrays.trace.push(phase)
  },
  writeObserved: (value: number) =>
    Effect.sync(() => {
      arrays.writeObserved.push(value)
    }),
  writeObservedSync: (value: number): void => {
    arrays.writeObserved.push(value)
  },
  encodeObserved: (outcome: Result.Result<number, DrawnDecisionError>) =>
    Effect.sync(() => {
      arrays.encodeObserved.push(outcome)
    }),
  encodeObservedSync: (outcome: Result.Result<number, DrawnDecisionError>): void => {
    arrays.encodeObserved.push(outcome)
  },
  getTrace: Effect.sync(() => [...arrays.trace] as const),
  getWriteObserved: Effect.sync(() => [...arrays.writeObserved] as const),
  getEncodeObserved: Effect.sync(() => [...arrays.encodeObserved] as const),
})

export const layerOver = (arrays: RecorderArrays): Layer.Layer<TraceRecorder> =>
  Layer.succeed(TraceRecorder, recorderServiceOver(arrays))

export const make: Effect.Effect<TraceRecorderService> = Effect.sync(() => recorderServiceOver())

export const layer: Layer.Layer<TraceRecorder> = Layer.effect(TraceRecorder, make)
