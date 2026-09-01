/// <reference types="vitest/import-meta" />
import { Cell } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Result from 'effect/Result'
import { FastCheck as fc } from 'effect/testing'
import { DrawnCommand, drawnDecision } from './DrawnDecision.workflow.js'
import type { DrawnDecisionError, DrawnDecisionWorkflow } from './DrawnDecision.workflow.js'
import { TraceRecorder } from './Recorder.js'

export interface Bag {
  readonly command: number
  readonly raw: number
  readonly decoded: DrawnCommand
  readonly decision: number
  readonly decisionError: DrawnDecisionError
  readonly output: number
  readonly response: number
  readonly decodeError: number
  readonly readError: never
  readonly writeError: never
}

const VOCABULARY = Cell.vocabulary

const FAILABLE: readonly {
  readonly phaseIndex: number
  readonly name: string
  readonly convention: 'either-fail' | 'either-pass'
}[] = VOCABULARY.phases.flatMap((phase, phaseIndex) =>
  phase.convention === 'either-fail' || phase.convention === 'either-pass'
    ? [{ phaseIndex, name: phase.name, convention: phase.convention }]
    : []
)

export interface DrawnFailure {
  readonly phaseIndex: number
  readonly name: string
  readonly convention: 'either-fail' | 'either-pass'
  readonly error: number
}
export interface SpecCase {
  readonly spec: {
    readonly read: (command: number) => Effect.Effect<number, never, TraceRecorder>
    readonly decode: (raw: number) => Result.Result<DrawnCommand, number>
    readonly decide: DrawnDecisionWorkflow
    readonly encode: (outcome: Result.Result<number, DrawnDecisionError>) => number
    readonly write: (out: number, raw: number) => Effect.Effect<number, never, TraceRecorder>
  }
  readonly command: number
  readonly response: number
  readonly failure: DrawnFailure | undefined
  readonly layer: Layer.Layer<TraceRecorder>
  readonly getTrace: Effect.Effect<readonly string[], never, TraceRecorder>
  readonly getWriteObserved: Effect.Effect<readonly number[], never, TraceRecorder>
  readonly getEncodeObserved: Effect.Effect<readonly Result.Result<number, DrawnDecisionError>[], never, TraceRecorder>
}

const makeSpecCase = (
  command: number,
  response: number,
  failure: DrawnFailure | undefined,
): SpecCase => {
  const trace: Array<string> = []
  const writeObserved: Array<number> = []
  const encodeObserved: Array<Result.Result<number, DrawnDecisionError>> = []

  const service = {
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

  const layer = Layer.succeed(TraceRecorder, service)

  const getTrace: Effect.Effect<readonly string[], never, TraceRecorder> = Effect.flatMap(
    TraceRecorder,
    (recorder) => recorder.getTrace,
  )
  const getWriteObserved: Effect.Effect<readonly number[], never, TraceRecorder> = Effect.flatMap(
    TraceRecorder,
    (recorder) => recorder.getWriteObserved,
  )
  const getEncodeObserved: Effect.Effect<readonly Result.Result<number, DrawnDecisionError>[], never, TraceRecorder> =
    Effect.flatMap(TraceRecorder, (recorder) => recorder.getEncodeObserved)

  const read = (_command: number): Effect.Effect<number, never, TraceRecorder> =>
    Effect.gen(function*() {
      const recorder = yield* TraceRecorder
      yield* recorder.record('read')
      return response
    })

  const decode = (raw: number): Result.Result<DrawnCommand, number> => {
    service.recordSync('decode')
    if (failure !== undefined && failure.phaseIndex === 1) {
      return Result.fail(failure.error)
    }
    return Result.succeed(DrawnCommand.make({ value: raw }))
  }

  const injection = failure !== undefined && failure.phaseIndex === 2
    ? { injected: true as const, error: failure.error }
    : { injected: false as const, error: 0 }

  const decide = drawnDecision(trace, 'decide', injection)

  const encode = (outcome: Result.Result<number, DrawnDecisionError>): number => {
    service.recordSync('encode')
    service.encodeObservedSync(outcome)
    return Result.match(outcome, {
      onFailure: (error) => error.code,
      onSuccess: (decision) => decision,
    })
  }

  const write = (out: number, _raw: number): Effect.Effect<number, never, TraceRecorder> =>
    Effect.gen(function*() {
      const recorder = yield* TraceRecorder
      yield* recorder.record('write')
      yield* recorder.writeObserved(out)
      return response
    })

  return {
    spec: { read, decode, decide, encode, write },
    command,
    response,
    failure,
    layer,
    getTrace,
    getWriteObserved,
    getEncodeObserved,
  }
}

export const specCase: fc.Arbitrary<SpecCase> = fc
  .record({
    command: fc.integer(),
    writeResponse: fc.integer(),
  })
  .chain((drawn) => {
    const drawFailure = (): fc.Arbitrary<DrawnFailure> =>
      fc
        .record({
          failingIndex: fc.nat({ max: FAILABLE.length - 1 }),
          error: fc.oneof(fc.constant(-1), fc.integer()),
        })
        .map(({ failingIndex, error }) => {
          const chosen = FAILABLE[failingIndex]
          if (chosen === undefined) {
            throw new Error('effect-cell-gen: a drawn failing index had no matching phase')
          }
          return {
            phaseIndex: chosen.phaseIndex,
            name: chosen.name,
            convention: chosen.convention,
            error,
          }
        })
    const maybeFailure: fc.Arbitrary<DrawnFailure | undefined> = FAILABLE.length === 0
      ? fc.constant(undefined)
      : fc.oneof(
        { arbitrary: drawFailure(), weight: 1 },
        { arbitrary: fc.constant(undefined), weight: 2 },
      )
    return maybeFailure.map((failure) => makeSpecCase(drawn.command, drawn.writeResponse, failure))
  })

const declaredOrder: readonly string[] = VOCABULARY.phases.map((phase) => phase.name)

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const EffectModule = await import('effect/Effect')
  const ResultModule = await import('effect/Result')

  const sameOrder = (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && a.every((entry, index) => entry === b[index])

  it.effect.prop(
    '∀d_Phases_≡Declared',
    [specCase],
    ([drawn]) =>
      Effect.gen(function*() {
        if (drawn.failure?.convention === 'either-fail') {
          return true
        }
        const cell = Cell.layer(drawn.spec)
        yield* Cell.run(cell, drawn.command).pipe(Effect.provide(drawn.layer))
        const trace = yield* drawn.getTrace.pipe(Effect.provide(drawn.layer))
        return sameOrder(trace, declaredOrder)
      }),
  )

  it.effect.prop(
    '∀d_Response_=LastWrite',
    [specCase],
    ([drawn]) =>
      Effect.gen(function*() {
        if (drawn.failure?.convention === 'either-fail') {
          return true
        }
        const cell = Cell.layer(drawn.spec)
        const response = yield* Cell.run(cell, drawn.command).pipe(Effect.provide(drawn.layer))
        return response === drawn.response
      }),
  )

  it.effect.prop(
    '∀d_LayerSpec_≡Chain',
    [specCase],
    ([drawn]) =>
      Effect.gen(function*() {
        const freshA = makeSpecCase(drawn.command, drawn.response, drawn.failure)
        const freshB = makeSpecCase(drawn.command, drawn.response, drawn.failure)
        const cellA = Cell.layer(freshA.spec)
        const cellB = Cell.layer(freshB.spec)
        const outcomeA = yield* EffectModule.result(Cell.run(cellA, freshA.command).pipe(Effect.provide(freshA.layer)))
        const outcomeB = yield* EffectModule.result(Cell.run(cellB, freshB.command).pipe(Effect.provide(freshB.layer)))
        const traceA = yield* freshA.getTrace.pipe(Effect.provide(freshA.layer))
        const traceB = yield* freshB.getTrace.pipe(Effect.provide(freshB.layer))
        const sameTrace = sameOrder(traceA, traceB)
        const sameDeclared = sameOrder(declaredOrder, declaredOrder)
        const sameOutcome = ResultModule.isSuccess(outcomeA) && ResultModule.isSuccess(outcomeB)
          ? outcomeA.success === outcomeB.success
          : ResultModule.isFailure(outcomeA) && ResultModule.isFailure(outcomeB) &&
            outcomeA.failure === outcomeB.failure
        return sameDeclared && sameTrace && sameOutcome
      }),
  )

  it.effect.prop(
    '∀d_FailureEitherFail_⊥Write',
    [specCase],
    ([drawn]) =>
      Effect.gen(function*() {
        const failure = drawn.failure
        if (failure === undefined || failure.convention !== 'either-fail') {
          return true
        }
        const cell = Cell.layer(drawn.spec)
        const outcome = yield* EffectModule.result(Cell.run(cell, drawn.command).pipe(Effect.provide(drawn.layer)))
        const writeObserved = yield* drawn.getWriteObserved.pipe(Effect.provide(drawn.layer))
        return ResultModule.isFailure(outcome) && outcome.failure === failure.error && writeObserved.length === 0
      }),
  )

  it.effect.prop(
    '∀d_FailureEitherPass_=Payload',
    [specCase],
    ([drawn]) =>
      Effect.gen(function*() {
        const failure = drawn.failure
        if (failure === undefined || failure.convention !== 'either-pass') {
          return true
        }
        const cell = Cell.layer(drawn.spec)
        const outcome = yield* EffectModule.result(Cell.run(cell, drawn.command).pipe(Effect.provide(drawn.layer)))
        if (!ResultModule.isSuccess(outcome)) {
          return false
        }
        const encodeObserved = yield* drawn.getEncodeObserved.pipe(Effect.provide(drawn.layer))
        const first = encodeObserved[0]
        const writeObserved = yield* drawn.getWriteObserved.pipe(Effect.provide(drawn.layer))
        return (
          outcome.success === drawn.response &&
          first !== undefined &&
          ResultModule.isFailure(first) &&
          first.failure.code === failure.error &&
          writeObserved[0] === failure.error
        )
      }),
  )
  it.effect.prop(
    '∀d_Composed_≡Trace',
    [specCase, specCase],
    ([first, second]) =>
      Effect.gen(function*() {
        if (first.failure?.convention === 'either-fail' || second.failure?.convention === 'either-fail') {
          return true
        }
        const sharedTrace: Array<string> = []
        const sharedWrite: Array<number> = []
        const sharedEncode: Array<Result.Result<number, DrawnDecisionError>> = []
        const sharedService = {
          record: (phase: string) =>
            Effect.sync(() => {
              sharedTrace.push(phase)
            }),
          recordSync: (phase: string): void => {
            sharedTrace.push(phase)
          },
          writeObserved: (value: number) =>
            Effect.sync(() => {
              sharedWrite.push(value)
            }),
          writeObservedSync: (value: number): void => {
            sharedWrite.push(value)
          },
          encodeObserved: (outcome: Result.Result<number, DrawnDecisionError>) =>
            Effect.sync(() => {
              sharedEncode.push(outcome)
            }),
          encodeObservedSync: (outcome: Result.Result<number, DrawnDecisionError>): void => {
            sharedEncode.push(outcome)
          },
          getTrace: Effect.sync(() => [...sharedTrace] as const),
          getWriteObserved: Effect.sync(() => [...sharedWrite] as const),
          getEncodeObserved: Effect.sync(() => [...sharedEncode] as const),
        }
        const sharedLayer = Layer.succeed(TraceRecorder, sharedService)
        const makeSharedSpec = (response: number, failure: DrawnFailure | undefined) => {
          const injection = failure !== undefined && failure.phaseIndex === 2
            ? { injected: true as const, error: failure.error }
            : { injected: false as const, error: 0 }
          const decide = drawnDecision(sharedTrace, 'decide', injection)
          const read = (_command: number): Effect.Effect<number, never, TraceRecorder> =>
            Effect.gen(function*() {
              const recorder = yield* TraceRecorder
              yield* recorder.record('read')
              return response
            })
          const decode = (raw: number): Result.Result<DrawnCommand, number> => {
            sharedService.recordSync('decode')
            if (failure !== undefined && failure.phaseIndex === 1) {
              return Result.fail(failure.error)
            }
            return Result.succeed(DrawnCommand.make({ value: raw }))
          }
          const encode = (outcome: Result.Result<number, DrawnDecisionError>): number => {
            sharedService.recordSync('encode')
            sharedService.encodeObservedSync(outcome)
            return Result.match(outcome, {
              onFailure: (error) => error.code,
              onSuccess: (decision) => decision,
            })
          }
          const write = (out: number, _raw: number): Effect.Effect<number, never, TraceRecorder> =>
            Effect.gen(function*() {
              const recorder = yield* TraceRecorder
              yield* recorder.record('write')
              yield* recorder.writeObserved(out)
              return response
            })
          return { read, decode, decide, encode, write }
        }
        const specA = makeSharedSpec(first.response, first.failure)
        const specB = makeSharedSpec(second.response, second.failure)
        const cellA = Cell.layer(specA)
        const cellB = Cell.layer(specB)
        const combined = pipe(cellA, Cell.andThen(cellB))
        yield* Cell.run(combined, first.command).pipe(Effect.provide(sharedLayer))
        const trace = yield* sharedService.getTrace
        const expected = [...declaredOrder, ...declaredOrder]
        return sameOrder(trace, expected)
      }),
  )
}
