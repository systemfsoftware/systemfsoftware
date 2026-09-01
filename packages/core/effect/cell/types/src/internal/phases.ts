import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as Result from 'effect/Result'
import { DESCRIPTION_MODULE, IO_CELLS, type IoCellClassification } from '../Facts.js'
import { type WorkflowBrand } from '../Workflow.js'
/**
 * The assembler's internal phase bag. `readServices`/`writeServices` carry the `Effect` `R`
 * the impure phases demand; the fold unions them into the interpreter's `R`.
 *
 * @internal
 */
export interface Phases {
  readonly command: unknown
  readonly raw: unknown
  readonly decoded: unknown
  readonly decision: unknown
  readonly decisionError: unknown
  readonly output: unknown
  readonly response: unknown
  readonly decodeError: unknown
  readonly readError: unknown
  readonly writeError: unknown
  readonly readServices: unknown
  readonly writeServices: unknown
}

/** @internal */
export type ReadPhase<P extends Phases> = (
  command: P['command'],
) => Effect.Effect<P['raw'], P['readError'], P['readServices']>

/** @internal */
export type DecodePhase<P extends Phases> = (
  raw: P['raw'],
) => Result.Result<P['decoded'], P['decodeError']>

/** @internal */
export type DecidePhase<P extends Phases> =
  & ((
    decoded: P['decoded'],
  ) => Result.Result<P['decision'], P['decisionError']>)
  & WorkflowBrand

/** @internal */
export type EncodePhase<P extends Phases> = (
  outcome: Result.Result<P['decision'], P['decisionError']>,
) => P['output']

/** @internal */
export type WritePhase<P extends Phases> = (
  output: P['output'],
  raw: P['raw'],
) => Effect.Effect<P['response'], P['writeError'], P['writeServices']>

/** @internal */
export type Convention = 'effect' | 'either-fail' | 'either-pass' | 'total'

/** @internal */
export interface ReadNode<P extends Phases> {
  readonly name: 'read'
  readonly kind: 'impure'
  readonly convention: 'effect'
  readonly run: ReadPhase<P>
}
/** @internal */
export interface DecodeNode<P extends Phases> {
  readonly name: 'decode'
  readonly kind: 'pure'
  readonly convention: 'either-fail'
  readonly run: DecodePhase<P>
}
/** @internal */
export interface DecideNode<P extends Phases> {
  readonly name: 'decide'
  readonly kind: 'pure'
  readonly convention: 'either-pass'
  readonly run: DecidePhase<P>
}
/** @internal */
export interface EncodeNode<P extends Phases> {
  readonly name: 'encode'
  readonly kind: 'pure'
  readonly convention: 'total'
  readonly run: EncodePhase<P>
}
/** @internal */
export interface WriteNode<P extends Phases> {
  readonly name: 'write'
  readonly kind: 'impure'
  readonly convention: 'effect'
  readonly run: WritePhase<P>
}

/** @internal */
export type Phase<P extends Phases> =
  | ReadNode<P>
  | DecodeNode<P>
  | DecideNode<P>
  | EncodeNode<P>
  | WriteNode<P>

/** @internal */
export interface Description<P extends Phases> {
  readonly module: typeof DESCRIPTION_MODULE
  readonly ioCells: IoCellClassification
  readonly phases: readonly Phase<P>[]
}

/** @internal */
export interface ReadDone<P extends Phases> extends Description<P> {
  readonly 'call read(command) before decode(raw)': true
}
/** @internal */
export interface DecodeDone<P extends Phases> extends Description<P> {
  readonly 'call decode(raw) before decide(decoded)': true
}
/** @internal */
export interface DecideDone<P extends Phases> extends Description<P> {
  readonly 'call decide(decoded) before encode(decision)': true
}
/** @internal */
export interface EncodeDone<P extends Phases> extends Description<P> {
  readonly 'call encode(decision) before write(output)': true
}
/** @internal */
export interface WriteDone<P extends Phases> extends Description<P> {
  readonly 'call write(output) before applying the description': true
}

const READ_DONE = 'call read(command) before decode(raw)'
const DECODE_DONE = 'call decode(raw) before decide(decoded)'
const DECIDE_DONE = 'call decide(decoded) before encode(decision)'
const ENCODE_DONE = 'call encode(decision) before write(output)'
const WRITE_DONE = 'call write(output) before applying the description'

/** @internal */
export const read = <P extends Phases>(run: ReadPhase<P>): ReadDone<P> => ({
  [READ_DONE]: true,
  module: DESCRIPTION_MODULE,
  ioCells: IO_CELLS,
  phases: [{ name: 'read', kind: 'impure', convention: 'effect', run }],
})

/** @internal */
export const decode: {
  <P extends Phases>(run: DecodePhase<P>): (self: ReadDone<P>) => DecodeDone<P>
  <P extends Phases>(self: ReadDone<P>, run: DecodePhase<P>): DecodeDone<P>
} = dual(2, <P extends Phases>(self: ReadDone<P>, run: DecodePhase<P>): DecodeDone<P> => ({
  [DECODE_DONE]: true,
  module: self.module,
  ioCells: self.ioCells,
  phases: [...self.phases, { name: 'decode', kind: 'pure', convention: 'either-fail', run }],
}))

/** @internal */
export const decide: {
  <P extends Phases>(run: DecidePhase<P>): (self: DecodeDone<P>) => DecideDone<P>
  <P extends Phases>(self: DecodeDone<P>, run: DecidePhase<P>): DecideDone<P>
} = dual(2, <P extends Phases>(self: DecodeDone<P>, run: DecidePhase<P>): DecideDone<P> => ({
  [DECIDE_DONE]: true,
  module: self.module,
  ioCells: self.ioCells,
  phases: [...self.phases, { name: 'decide', kind: 'pure', convention: 'either-pass', run }],
}))

/** @internal */
export const encode: {
  <P extends Phases>(run: EncodePhase<P>): (self: DecideDone<P>) => EncodeDone<P>
  <P extends Phases>(self: DecideDone<P>, run: EncodePhase<P>): EncodeDone<P>
} = dual(2, <P extends Phases>(self: DecideDone<P>, run: EncodePhase<P>): EncodeDone<P> => ({
  [ENCODE_DONE]: true,
  module: self.module,
  ioCells: self.ioCells,
  phases: [...self.phases, { name: 'encode', kind: 'pure', convention: 'total', run }],
}))

/** @internal */
export const write: {
  <P extends Phases>(run: WritePhase<P>): (self: EncodeDone<P>) => WriteDone<P>
  <P extends Phases>(self: EncodeDone<P>, run: WritePhase<P>): WriteDone<P>
} = dual(2, <P extends Phases>(self: EncodeDone<P>, run: WritePhase<P>): WriteDone<P> => ({
  [WRITE_DONE]: true,
  module: self.module,
  ioCells: self.ioCells,
  phases: [...self.phases, { name: 'write', kind: 'impure', convention: 'effect', run }],
}))

type FoldValue<P extends Phases> =
  | P['command']
  | P['raw']
  | P['decoded']
  | Result.Result<P['decision'], P['decisionError']>
  | P['output']
  | P['response']

const isOutcome = <P extends Phases>(
  value: FoldValue<P>,
): value is Result.Result<P['decision'], P['decisionError']> => Result.isResult(value)

/**
 * The one-sandwich interpreter. Reads the command, runs decode/decide/encode against the raw
 * the read produced, and closes with the write. A decode refusal fails; a decide refusal is
 * the outcome the encode and write receive.
 *
 * @internal
 */
export const fold = <P extends Phases>(
  description: WriteDone<P>,
  command: P['command'],
): Effect.Effect<
  P['response'],
  P['readError'] | P['decodeError'] | P['writeError'],
  P['readServices'] | P['writeServices']
> =>
  Effect.gen(function*() {
    const phases = description.phases
    const last = phases[phases.length - 1]
    if (!last || last.name !== 'write') {
      return yield* Effect.die(
        new Error('effect-cell-types: a description reached the interpreter without a write phase closing it'),
      )
    }

    let value: FoldValue<P> = command
    let raw: FoldValue<P> = command
    for (const phase of phases) {
      if (phase === last) break
      switch (phase.convention) {
        case 'effect': {
          if (phase.name === 'read') {
            value = yield* phase.run(value)
            raw = value
            break
          }
          value = yield* phase.run(value, raw)
          break
        }
        case 'either-fail': {
          value = yield* Result.match(phase.run(value), {
            onFailure: Effect.fail,
            onSuccess: Effect.succeed,
          })
          break
        }
        case 'either-pass': {
          value = phase.run(value)
          break
        }
        case 'total': {
          if (!isOutcome(value)) {
            return yield* Effect.die(
              new Error(
                'effect-cell-types: an encode phase received a value that is not the decide outcome',
              ),
            )
          }
          value = phase.run(value)
          break
        }
        default: {
          const unreachable: never = phase
          return yield* Effect.die(
            new Error(`effect-cell-types: unknown phase convention ${String(unreachable)}`),
          )
        }
      }
    }
    return yield* last.run(value, raw)
  })
