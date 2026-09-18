import * as Effect from 'effect/Effect'
import { pipeArguments } from 'effect/Pipeable'
import * as Result from 'effect/Result'
import { type Cell, CellTypeId } from './Cell.js'
import { type WorkflowBrand } from './Workflow.js'

const PipeInspectableProto = {
  pipe() {
    return pipeArguments(this, arguments)
  },
}

const PurePhaseBrand: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/PurePhase')
type PurePhaseBrand = typeof PurePhaseBrand

export type PurePhase<In, Out, E = never> = ((input: In) => Result.Result<Out, E>) & {
  readonly [PurePhaseBrand]: true
}

export const pure = <In, Out, E = never>(fn: (input: In) => Result.Result<Out, E>): PurePhase<In, Out, E> =>
  Object.assign(fn, { [PurePhaseBrand]: true as const })

export interface ReadChain<I, Raw, RE, RR> {
  readonly 'sentence: must decode or decide after read': true
  decode<Dcd, DecE>(phase: PurePhase<Raw, Dcd, DecE>): DecodedChain<I, Raw, Dcd, RE, DecE, RR>
  decide<Dec, DE>(
    workflow: ((decoded: Raw) => Result.Result<Dec, DE>) & WorkflowBrand,
  ): RawDecidedChain<I, Raw, Dec, DE, RE, RR>
}

export interface DecodedChain<I, Raw, Dcd, RE, DecE, RR> {
  readonly 'sentence: must decide after decode': true
  decide<Dec, DE>(
    workflow: ((decoded: Dcd) => Result.Result<Dec, DE>) & WorkflowBrand,
  ): DecodedDecidedChain<I, Raw, Dec, DE, RE, DecE, RR>
}

export interface RawDecidedChain<I, Raw, Dec, DE, RE, RR> {
  readonly 'sentence: must write after decide on raw chain': true
  write<Resp, WE, WR>(
    run: (output: Result.Result<Dec, DE>, raw: Raw) => Effect.Effect<Resp, WE, WR>,
  ): Cell<I, Resp, RE | WE, RR | WR> & { readonly phases: readonly ['read', 'decide', 'write'] }
}

export interface DecodedDecidedChain<I, Raw, Dec, DE, RE, DecE, RR> {
  readonly 'sentence: must encode after decide on decoded chain': true
  encode<Out>(phase: PurePhase<Result.Result<Dec, DE>, Out, never>): EncodedChain<I, Raw, Out, RE, DecE, RR>
}

export interface EncodedChain<I, Raw, Out, RE, DecE, RR> {
  readonly 'sentence: must write after encode': true
  write<Resp, WE, WR>(
    run: (output: Out, raw: Raw) => Effect.Effect<Resp, WE, WR>,
  ): Cell<I, Resp, RE | DecE | WE, RR | WR> & {
    readonly phases: readonly ['read', 'decode', 'decide', 'encode', 'write']
  }
}

export const read = <I, Raw, RE, RR>(run: (command: I) => Effect.Effect<Raw, RE, RR>): ReadChain<I, Raw, RE, RR> => {
  const decode = <Dcd, DecE>(phase: PurePhase<Raw, Dcd, DecE>): DecodedChain<I, Raw, Dcd, RE, DecE, RR> => {
    const decide = <Dec, DE>(
      workflow: ((decoded: Dcd) => Result.Result<Dec, DE>) & WorkflowBrand,
    ): DecodedDecidedChain<I, Raw, Dec, DE, RE, DecE, RR> => {
      const encode = <Out>(
        encodePhase: PurePhase<Result.Result<Dec, DE>, Out, never>,
      ): EncodedChain<I, Raw, Out, RE, DecE, RR> => {
        const write = <Resp, WE, WR>(
          writeRun: (output: Out, raw: Raw) => Effect.Effect<Resp, WE, WR>,
        ): Cell<I, Resp, RE | DecE | WE, RR | WR> & {
          readonly phases: readonly ['read', 'decode', 'decide', 'encode', 'write']
        } => {
          const composed = (input: I): Effect.Effect<Resp, RE | DecE | WE, RR | WR> =>
            Effect.gen(function*() {
              const raw = yield* run(input)
              const decoded = yield* Result.match(phase(raw), {
                onFailure: Effect.fail,
                onSuccess: Effect.succeed,
              })
              const outcome = workflow(decoded)
              const encoded = Result.getOrThrow(encodePhase(outcome))
              return yield* writeRun(encoded, raw)
            })
          return {
            [CellTypeId]: CellTypeId,
            run: composed,
            phases: ['read', 'decode', 'decide', 'encode', 'write'],
            ...PipeInspectableProto,
          }
        }
        return { 'sentence: must write after encode': true, write }
      }
      return { 'sentence: must encode after decide on decoded chain': true, encode }
    }
    return { 'sentence: must decide after decode': true, decide }
  }
  const decide = <Dec, DE>(
    workflow: ((decoded: Raw) => Result.Result<Dec, DE>) & WorkflowBrand,
  ): RawDecidedChain<I, Raw, Dec, DE, RE, RR> => {
    const write = <Resp, WE, WR>(
      writeRun: (output: Result.Result<Dec, DE>, raw: Raw) => Effect.Effect<Resp, WE, WR>,
    ): Cell<I, Resp, RE | WE, RR | WR> & { readonly phases: readonly ['read', 'decide', 'write'] } => {
      const composed = (input: I): Effect.Effect<Resp, RE | WE, RR | WR> =>
        Effect.gen(function*() {
          const raw = yield* run(input)
          const outcome = workflow(raw)
          return yield* writeRun(outcome, raw)
        })
      return {
        [CellTypeId]: CellTypeId,
        run: composed,
        phases: ['read', 'decide', 'write'],
        ...PipeInspectableProto,
      }
    }
    return { 'sentence: must write after decide on raw chain': true, write }
  }
  return { 'sentence: must decode or decide after read': true, decode, decide }
}
