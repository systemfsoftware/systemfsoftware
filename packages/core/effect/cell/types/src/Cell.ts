import * as Effect from 'effect/Effect'
import { dual, identity, pipe } from 'effect/Function'
import * as Result from 'effect/Result'
import { CanonicalCommand, canonicalDecide } from './CanonicalDecide.workflow.js'
import { type WorkflowBrand } from './Workflow.js'

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
}

export type ReadPhase<P extends Phases> = (
  command: P['command'],
) => Effect.Effect<P['raw'], P['readError'], never>

export type DecodePhase<P extends Phases> = (
  raw: P['raw'],
) => Result.Result<P['decoded'], P['decodeError']>

export type DecidePhase<P extends Phases> =
  & ((
    decoded: P['decoded'],
  ) => Result.Result<P['decision'], P['decisionError']>)
  & WorkflowBrand

export type EncodePhase<P extends Phases> = (
  outcome: Result.Result<P['decision'], P['decisionError']>,
) => P['output']

export type WritePhase<P extends Phases> = (
  output: P['output'],
  raw: P['raw'],
) => Effect.Effect<P['response'], P['writeError'], never>

export type Convention = 'effect' | 'either-fail' | 'either-pass' | 'total'

export interface ReadNode<P extends Phases> {
  readonly name: 'read'
  readonly kind: 'impure'
  readonly convention: 'effect'
  readonly run: ReadPhase<P>
}
export interface DecodeNode<P extends Phases> {
  readonly name: 'decode'
  readonly kind: 'pure'
  readonly convention: 'either-fail'
  readonly run: DecodePhase<P>
}
export interface DecideNode<P extends Phases> {
  readonly name: 'decide'
  readonly kind: 'pure'
  readonly convention: 'either-pass'
  readonly run: DecidePhase<P>
}
export interface EncodeNode<P extends Phases> {
  readonly name: 'encode'
  readonly kind: 'pure'
  readonly convention: 'total'
  readonly run: EncodePhase<P>
}
export interface WriteNode<P extends Phases> {
  readonly name: 'write'
  readonly kind: 'impure'
  readonly convention: 'effect'
  readonly run: WritePhase<P>
}

export type Phase<P extends Phases> =
  | ReadNode<P>
  | DecodeNode<P>
  | DecideNode<P>
  | EncodeNode<P>
  | WriteNode<P>

export const DESCRIPTION_MODULE = '@systemfsoftware/effect-cell-types' as const

export const IO_CELLS = {
  cells: ['store', 'adapter'],
  sources: ['effect/Clock', 'effect/System'],
} as const

export type IoCellClassification = typeof IO_CELLS

export interface Description<P extends Phases> {
  readonly module: typeof DESCRIPTION_MODULE
  readonly ioCells: IoCellClassification
  readonly phases: readonly Phase<P>[]
}

export interface ReadDone<P extends Phases> extends Description<P> {
  readonly 'call read(command) before decode(raw)': true
}
export interface DecodeDone<P extends Phases> extends Description<P> {
  readonly 'call decode(raw) before decide(decoded)': true
}
export interface DecideDone<P extends Phases> extends Description<P> {
  readonly 'call decide(decoded) before encode(decision)': true
}
export interface EncodeDone<P extends Phases> extends Description<P> {
  readonly 'call encode(decision) before write(output)': true
}
export interface WriteDone<P extends Phases> extends Description<P> {
  readonly 'call write(output) before applying the description': true
}

const READ_DONE = 'call read(command) before decode(raw)'
const DECODE_DONE = 'call decode(raw) before decide(decoded)'
const DECIDE_DONE = 'call decide(decoded) before encode(decision)'
const ENCODE_DONE = 'call encode(decision) before write(output)'
const WRITE_DONE = 'call write(output) before applying the description'

export const read = <P extends Phases>(run: ReadPhase<P>): ReadDone<P> => ({
  [READ_DONE]: true,
  module: DESCRIPTION_MODULE,
  ioCells: IO_CELLS,
  phases: [{ name: 'read', kind: 'impure', convention: 'effect', run }],
})

export const decode: {
  <P extends Phases>(run: DecodePhase<P>): (self: ReadDone<P>) => DecodeDone<P>
  <P extends Phases>(self: ReadDone<P>, run: DecodePhase<P>): DecodeDone<P>
} = dual(2, <P extends Phases>(self: ReadDone<P>, run: DecodePhase<P>): DecodeDone<P> => ({
  [DECODE_DONE]: true,
  module: self.module,
  ioCells: self.ioCells,
  phases: [...self.phases, { name: 'decode', kind: 'pure', convention: 'either-fail', run }],
}))

export const decide: {
  <P extends Phases>(run: DecidePhase<P>): (self: DecodeDone<P>) => DecideDone<P>
  <P extends Phases>(self: DecodeDone<P>, run: DecidePhase<P>): DecideDone<P>
} = dual(2, <P extends Phases>(self: DecodeDone<P>, run: DecidePhase<P>): DecideDone<P> => ({
  [DECIDE_DONE]: true,
  module: self.module,
  ioCells: self.ioCells,
  phases: [...self.phases, { name: 'decide', kind: 'pure', convention: 'either-pass', run }],
}))

export const encode: {
  <P extends Phases>(run: EncodePhase<P>): (self: DecideDone<P>) => EncodeDone<P>
  <P extends Phases>(self: DecideDone<P>, run: EncodePhase<P>): EncodeDone<P>
} = dual(2, <P extends Phases>(self: DecideDone<P>, run: EncodePhase<P>): EncodeDone<P> => ({
  [ENCODE_DONE]: true,
  module: self.module,
  ioCells: self.ioCells,
  phases: [...self.phases, { name: 'encode', kind: 'pure', convention: 'total', run }],
}))

export const write: {
  <P extends Phases>(run: WritePhase<P>): (self: EncodeDone<P>) => WriteDone<P>
  <P extends Phases>(self: EncodeDone<P>, run: WritePhase<P>): WriteDone<P>
} = dual(2, <P extends Phases>(self: EncodeDone<P>, run: WritePhase<P>): WriteDone<P> => ({
  [WRITE_DONE]: true,
  module: self.module,
  ioCells: self.ioCells,
  phases: [...self.phases, { name: 'write', kind: 'impure', convention: 'effect', run }],
}))

interface LayerCore<C, Raw, RE, Dec, DE, Resp, WE> {
  readonly read: (command: C) => Effect.Effect<Raw, RE, never>
  readonly decide: ((decoded: Raw) => Result.Result<Dec, DE>) & WorkflowBrand
  readonly write: (output: Result.Result<Dec, DE>, raw: Raw) => Effect.Effect<Resp, WE, never>
}

interface LayerShortSpec<C, Raw, RE, Dec, DE, Resp, WE> extends LayerCore<C, Raw, RE, Dec, DE, Resp, WE> {
  readonly decode?: never
  readonly encode?: never
}

interface LayerLongSpec<C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE>
  extends Omit<LayerCore<C, Raw, RE, Dec, DE, Resp, WE>, 'decide' | 'write'>
{
  readonly decode: (raw: Raw) => Result.Result<Dcd, DecE>
  readonly decide: ((decoded: Dcd) => Result.Result<Dec, DE>) & WorkflowBrand
  readonly encode: (outcome: Result.Result<Dec, DE>) => Out
  readonly write: (output: Out, raw: Raw) => Effect.Effect<Resp, WE, never>
}

type LayerBag<C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE> = {
  readonly command: C
  readonly raw: Raw
  readonly decoded: Dcd
  readonly decision: Dec
  readonly decisionError: DE
  readonly output: Out
  readonly response: Resp
  readonly decodeError: DecE
  readonly readError: RE
  readonly writeError: WE
}

const layerImpl = <C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE>(
  spec:
    | LayerCore<C, Raw, RE, Dec, DE, Resp, WE>
    | LayerLongSpec<C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE>,
) => {
  if ('decode' in spec && 'encode' in spec) {
    return pipe(
      read<LayerBag<C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE>>(spec.read),
      decode<LayerBag<C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE>>(spec.decode),
      decide<LayerBag<C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE>>(spec.decide),
      encode<LayerBag<C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE>>(spec.encode),
      write<LayerBag<C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE>>(spec.write),
    )
  }
  return pipe(
    read<LayerBag<C, Raw, RE, Raw, never, Dec, DE, Result.Result<Dec, DE>, Resp, WE>>(spec.read),
    decode<LayerBag<C, Raw, RE, Raw, never, Dec, DE, Result.Result<Dec, DE>, Resp, WE>>(Result.succeed),
    decide<LayerBag<C, Raw, RE, Raw, never, Dec, DE, Result.Result<Dec, DE>, Resp, WE>>(spec.decide),
    encode<LayerBag<C, Raw, RE, Raw, never, Dec, DE, Result.Result<Dec, DE>, Resp, WE>>(identity),
    write<LayerBag<C, Raw, RE, Raw, never, Dec, DE, Result.Result<Dec, DE>, Resp, WE>>(spec.write),
  )
}

export function layer<C, Raw, RE, Dec, DE, Resp, WE>(
  spec: LayerShortSpec<C, Raw, RE, Dec, DE, Resp, WE>,
): WriteDone<LayerBag<C, Raw, RE, Raw, never, Dec, DE, Result.Result<Dec, DE>, Resp, WE>>
export function layer<C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE>(
  spec: LayerLongSpec<C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE>,
): WriteDone<LayerBag<C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE>>
export function layer<C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE>(
  spec:
    | LayerShortSpec<C, Raw, RE, Dec, DE, Resp, WE>
    | LayerLongSpec<C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE>,
) {
  return layerImpl(spec)
}

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

export const apply = <P extends Phases>(description: WriteDone<P>, command: P['command']) =>
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
        case 'effect':
          if (phase.name === 'read') {
            value = yield* phase.run(value)
            raw = value
            break
          }
          value = yield* phase.run(value, raw)
          break
        case 'either-fail':
          value = yield* Result.match(phase.run(value), {
            onFailure: Effect.fail,
            onSuccess: Effect.succeed,
          })
          break
        case 'either-pass':
          value = phase.run(value)
          break
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

export interface PhaseFact {
  readonly name: Phase<Phases>['name']
  readonly kind: Phase<Phases>['kind']
  readonly convention: Convention
}

export interface Vocabulary {
  readonly module: typeof DESCRIPTION_MODULE
  readonly ioCells: IoCellClassification
  readonly phases: readonly PhaseFact[]
  readonly byKind: Readonly<Record<PhaseFact['kind'], readonly PhaseFact['name'][]>>
  readonly applier: 'apply'
}

interface CanonicalPhases extends Phases {
  readonly decoded: CanonicalCommand
}

export const canonical: WriteDone<CanonicalPhases> = write(
  encode(
    decide(
      decode(read<CanonicalPhases>(() => Effect.void), () => Result.succeed(CanonicalCommand.make({}))),
      canonicalDecide,
    ),
    () => undefined,
  ),
  () => Effect.void,
)

const WALKED_PHASES: readonly PhaseFact[] = canonical.phases.map(
  ({ convention, kind, name }): PhaseFact => ({ convention, kind, name }),
)

export const vocabulary: Vocabulary = {
  module: canonical.module,
  ioCells: canonical.ioCells,
  phases: WALKED_PHASES,
  byKind: {
    pure: WALKED_PHASES.filter((phase) => phase.kind === 'pure').map((phase) => phase.name),
    impure: WALKED_PHASES.filter((phase) => phase.kind === 'impure').map((phase) => phase.name),
  },
  applier: 'apply',
}
