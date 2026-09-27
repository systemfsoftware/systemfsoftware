import { Effect, Result, Schema } from 'effect'
import { EXIT_OF_ERROR, SystemfError } from '../contract/errors.js'
import { API_VERSION, Response } from '../contract/result.js'
import type { ErrorCode, ErrorEnvelope } from '../contract/result.js'
import { Output } from './output.js'

const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Response))

const jsonOf = (envelope: Response): Effect.Effect<string> => Effect.orDie(encodeJson(envelope))

export const errorEnvelope = (error: SystemfError): ErrorEnvelope => ({
  apiVersion: API_VERSION,
  error: error.message,
  code: error.code,
  ...(error.suggestions === undefined ? {} : { suggestions: [...error.suggestions] }),
})

const emit = (output: Output, envelope: Response, human: readonly string[]): Effect.Effect<void> =>
  Effect.gen(function*() {
    const text = yield* (output.json ? jsonOf(envelope) : Effect.succeed(human.join('\n')))
    yield* output.emit(text)
  })

export const failureLine = (envelope: ErrorEnvelope): string => `${envelope.code}: ${envelope.error}`

export const codeLine = (code: ErrorCode): string => `code: ${code}`

export interface Emission {
  readonly output: Output
  readonly envelope: ErrorEnvelope
  readonly human: string
}

export const emitFailure = (emission: Emission): Effect.Effect<void> =>
  Effect.gen(function*() {
    yield* emit(emission.output, emission.envelope, [emission.human])
    yield* emission.output.setExitCode(EXIT_OF_ERROR)
  })

export interface Presentation {
  readonly envelope: Response
  readonly human: readonly string[]
  readonly exitCode: number
}

export interface Guarded<D, R> {
  readonly program: Effect.Effect<D, SystemfError, R>
  readonly build: (data: D) => Presentation
}

export const guard = <D, R>(guarded: Guarded<D, R>): Effect.Effect<void, never, R> =>
  Effect.gen(function*() {
    const output = yield* Output
    const result = yield* Effect.result(guarded.program)
    if (Result.isFailure(result)) {
      const envelope = errorEnvelope(result.failure)
      return yield* emitFailure({ output, envelope, human: failureLine(envelope) })
    }
    const presentation = guarded.build(result.success)
    yield* emit(output, presentation.envelope, presentation.human)
    yield* output.setExitCode(presentation.exitCode)
  })
