import { Cell } from '@systemfsoftware/effect-cell-types'
import type { Effect } from 'effect/Effect'
import { pipe } from 'effect/Function'
import type { Result } from 'effect/Result'
import { describe, expect, it } from 'tstyche'

interface Cmd {
  readonly id: string
}
interface Raw {
  readonly bytes: string
}
interface Decoded {
  readonly length: number
}
interface Decision {
  readonly admitted: boolean
}
interface Refusal {
  readonly why: string
}
interface Output {
  readonly line: string
}
interface DecodeErr {
  readonly malformed: string
}

interface Shape extends Cell.Phases {
  readonly command: Cmd
  readonly raw: Raw
  readonly decoded: Decoded
  readonly decision: Decision
  readonly decisionError: Refusal
  readonly output: Output
  readonly response: void
  readonly decodeError: DecodeErr
  readonly readError: never
  readonly writeError: never
  readonly readContext: never
  readonly writeContext: never
}

declare const readPhase: Cell.ReadPhase<Shape>
declare const decodePhase: Cell.DecodePhase<Shape>
declare const decidePhase: Cell.DecidePhase<Shape>
declare const encodePhase: Cell.EncodePhase<Shape>
declare const writePhase: Cell.WritePhase<Shape>

// Stage fixtures for the typed-variable call shape. The measured finding is that a
// stage reached through a variable and a stage reached inline are two distinct call
// shapes, and a design can reject one while admitting the other.
declare const readStage: Cell.ReadDone<Shape>
declare const decodeStage: Cell.DecodeDone<Shape>
declare const decideStage: Cell.DecideDone<Shape>

// An effect handed to each pure slot. A pure slot's return type is a plain value or a
// `Result`, so an effect in that position fails assignability with no lint rule involved.
declare const decodeReturningEffect: (raw: Raw) => Effect<Decoded, DecodeErr, never>
declare const decideReturningEffect: (decoded: Decoded) => Effect<Decision, Refusal, never>
declare const encodeReturningEffect: (outcome: Result<Decision, Refusal>) => Effect<Output, never, never>
// A read whose interior gathers a product: fan-in, expressed as one read step.
declare const readGatheringProduct: (command: Cmd) => Effect<Raw, never, never>

describe('the order the chain decides', () => {
  it('Should_Compile_When_PhasesAreSuppliedInOrder', () => {
    expect(
      Cell.write(
        Cell.encode(Cell.decide(Cell.decode(Cell.read(readPhase), decodePhase), decidePhase), encodePhase),
        writePhase,
      ),
    ).type.toBe<Cell.WriteDone<Shape>>()
  })

  it('Should_NameTheSkippedPhase_When_DecideFollowsReadInline', () => {
    // @ts-expect-error: call decode(raw) before decide(decoded)
    Cell.decide(Cell.read(readPhase), decidePhase)
  })

  it('Should_NameTheSkippedPhase_When_DecideFollowsReadThroughAVariable', () => {
    // @ts-expect-error: call decode(raw) before decide(decoded)
    Cell.decide(readStage, decidePhase)
  })

  it('Should_NameTheInvertedPhase_When_DecodeFollowsDecideInline', () => {
    // @ts-expect-error: call read(command) before decode(raw)
    Cell.decode(Cell.decide(Cell.decode(Cell.read(readPhase), decodePhase), decidePhase), decodePhase)
  })

  it('Should_NameTheInvertedPhase_When_DecodeFollowsDecideThroughAVariable', () => {
    // @ts-expect-error: call read(command) before decode(raw)
    Cell.decode(decideStage, decodePhase)
  })

  it('Should_NameTheSkippedPhase_When_WriteFollowsDecodeInline', () => {
    // @ts-expect-error: call encode(decision) before write(output)
    Cell.write(Cell.decode(Cell.read(readPhase), decodePhase), writePhase)
  })
})

describe('the pure slots refuse an effect', () => {
  it('Should_RejectEffectReturningDecode_When_SlotRequiresResult', () => {
    expect<typeof Cell.decode<Shape>>().type.not.toBeCallableWith(readStage, decodeReturningEffect)
  })

  it('Should_RejectEffectReturningDecide_When_SlotRequiresResult', () => {
    expect<typeof Cell.decide<Shape>>().type.not.toBeCallableWith(decodeStage, decideReturningEffect)
  })

  it('Should_RejectEffectReturningEncode_When_SlotRequiresAPlainValue', () => {
    expect<typeof Cell.encode<Shape>>().type.not.toBeCallableWith(decideStage, encodeReturningEffect)
  })

  it('Should_AcceptResultReturningDecode_When_SlotRequiresResult', () => {
    expect<typeof Cell.decode<Shape>>().type.toBeCallableWith(readStage, decodePhase)
  })
})

describe('the shapes that stay legal', () => {
  it('Should_Compile_When_ReadGathersAProductInOneStep', () => {
    expect<typeof Cell.read<Shape>>().type.toBeCallableWith(readGatheringProduct)
  })

  it('Should_Compile_When_DescriptionCarriesOneReadOnly', () => {
    expect(Cell.read(readPhase)).type.toBe<Cell.ReadDone<Shape>>()
  })

  it('Should_Compile_When_DescriptionEndsAtEncodeWithNoWrite', () => {
    // A query: what it shapes *is* its response, so there is no terminal write phase and
    // the pairwise order constraint has no adjacent pair left to check.
    expect(
      Cell.encode(Cell.decide(Cell.decode(Cell.read(readPhase), decodePhase), decidePhase), encodePhase),
    ).type.toBe<Cell.EncodeDone<Shape>>()
  })

  it('Should_OpenASecondLayer_When_ReadFollowsAWrite', () => {
    const firstLayer = Cell.write(
      Cell.encode(Cell.decide(Cell.decode(Cell.read(readPhase), decodePhase), decidePhase), encodePhase),
      writePhase,
    )
    expect(Cell.read(readPhase, firstLayer)).type.toBe<Cell.ReadDone<Shape>>()
  })
})

describe('the decision error is an outcome, not a fault', () => {
  it('Should_HandBothBranchesToEncode_When_DecideReturnsResult', () => {
    expect<Cell.EncodePhase<Shape>>().type.toBe<(outcome: Result<Decision, Refusal>) => Output>()
  })

  it('Should_KeepDecodeErrorSeparate_When_DecisionErrorIsAnOutcome', () => {
    expect<Cell.DecodePhase<Shape>>().type.toBe<(raw: Raw) => Result<Decoded, DecodeErr>>()
  })
})

// A bag whose `decode` cannot fail but whose `decide` refuses. This is the sharpest test of
// the two `Left` rules: `Refusal` must be absent from the derived error channel, because a
// decide Left travels forward as a value and is never yielded as a failure.
interface Infallible extends Cell.Phases {
  readonly command: Cmd
  readonly raw: Raw
  readonly decoded: Decoded
  readonly decision: Decision
  readonly decisionError: Refusal
  readonly output: Output
  readonly response: boolean
  readonly decodeError: never
  readonly readError: never
  readonly writeError: never
  readonly readContext: never
  readonly writeContext: never
}

// A bag whose read and write each require a different service.
interface Db {
  readonly query: () => string
}
interface Bus {
  readonly emit: (line: string) => void
}
interface Requiring extends Cell.Phases {
  readonly command: Cmd
  readonly raw: Raw
  readonly decoded: Decoded
  readonly decision: Decision
  readonly decisionError: Refusal
  readonly output: Output
  readonly response: void
  readonly decodeError: DecodeErr
  readonly readError: never
  readonly writeError: never
  readonly readContext: Db
  readonly writeContext: Bus
}

declare const infallible: Cell.WriteDone<Infallible>
declare const requiring: Cell.WriteDone<Requiring>
declare const plain: Cell.WriteDone<Shape>
declare const command: Cmd

describe('the channels the interpreter derives', () => {
  it('Should_CarryDecodeFailure_When_DecodeCanFail', () => {
    expect(Cell.apply(plain, command)).type.toBe<Effect<void, DecodeErr, never>>()
  })

  it('Should_OmitDecisionError_When_DecideReturnsAnErrorVariant', () => {
    expect(Cell.apply(infallible, command)).type.toBe<Effect<boolean, never, never>>()
  })

  it('Should_UnionBothServices_When_ReadAndWriteEachRequireOne', () => {
    expect(Cell.apply(requiring, command)).type.toBe<Effect<void, DecodeErr, Bus | Db>>()
  })

  it('Should_RequireAWrittenDescription_When_Applying', () => {
    // @ts-expect-error: call write(output) before applying the description
    Cell.apply(Cell.read(readPhase), command)
  })
})

describe('the order the chain decides, written in pipe', () => {
  it('Should_Compile_When_PhasesArePipedInOrder', () => {
    expect(
      pipe(
        Cell.read<Shape>(readPhase),
        Cell.decode(decodePhase),
        Cell.decide(decidePhase),
        Cell.encode(encodePhase),
        Cell.write(writePhase),
      ),
    ).type.toBe<Cell.WriteDone<Shape>>()
  })

  it('Should_NameTheSkippedPhase_When_DecidePipedAfterRead', () => {
    // @ts-expect-error: call decode(raw) before decide(decoded)
    pipe(Cell.read<Shape>(readPhase), Cell.decide(decidePhase))
  })

  it('Should_NameTheInvertedPhase_When_DecodePipedAfterDecide', () => {
    // @ts-expect-error: call read(command) before decode(raw)
    pipe(decideStage, Cell.decode(decodePhase))
  })

  it('Should_KeepTheDataFirstCallStyle_When_ConsumerDoesNotPipe', () => {
    expect(Cell.decode(readStage, decodePhase)).type.toBe<Cell.DecodeDone<Shape>>()
  })
})

describe('the description value is a foldable record', () => {
  it('Should_CarryTheVocabulary_When_AnyStageIsFolded', () => {
    expect<Cell.WriteDone<Shape>>().type.toBeAssignableTo<Cell.Description<Shape>>()
    expect<Cell.ReadDone<Shape>>().type.toBeAssignableTo<Cell.Description<Shape>>()
    expect<Cell.EncodeDone<Shape>>().type.toBeAssignableTo<Cell.Description<Shape>>()
  })

  // The module and I/O-cell classification are closed vocabularies this module declares,
  // so asserting them here cannot make a reclassification fail in a file outside it.
  it('Should_CarryModuleAndIoCells_When_ReadingTheDescriptionRoot', () => {
    expect<Cell.Description<Shape>['module']>().type.toBe<typeof Cell.DESCRIPTION_MODULE>()
    expect<Cell.Description<Shape>['ioCells']>().type.toBe<typeof Cell.IO_CELLS>()
  })

  it('Should_CarryOrderedPhaseRecords_When_ReadingALayer', () => {
    expect<Cell.Description<Shape>['layers'][number]['phases']>().type.toBe<
      readonly Cell.Phase<Shape>[]
    >()
  })

  it('Should_CarryKindAndConvention_When_ReadingAPhaseRecord', () => {
    // `name` is not asserted here. A literal union of the names would be a second
    // declaration of axis 1, and it would make adding a phase fail in this file rather
    // than in the module that owns the name. `kind` and `convention` stay: they are closed
    // vocabularies this module declares, not per-phase facts, so a new phase does not
    // extend them.
    expect<Cell.Phase<Shape>['kind']>().type.toBe<'pure' | 'impure'>()
    expect<Cell.Phase<Shape>['convention']>().type.toBe<Cell.Convention>()
  })
})

describe('what the write receives', () => {
  it('Should_HandTheWriteTheRaw_When_ItDeclaresASecondParameter', () => {
    expect<Parameters<Cell.WritePhase<Shape>>>().type.toBe<[output: Output, raw: Raw]>()
  })

  // The reason the argument is second and not first. A write authored before the raw
  // channel existed declares one parameter, and TypeScript admits a shorter function
  // wherever a longer signature is expected — so this assertion is what says the addition
  // is not a break for any write already written.
  it('Should_StillAdmitAUnaryWrite_When_TheWriteIgnoresTheRaw', () => {
    expect<(output: Output) => Effect<void, never, never>>().type.toBeAssignableTo<
      Cell.WritePhase<Shape>
    >()
  })

  it('Should_RefuseTheWrite_When_ItsSecondParameterIsNotTheRaw', () => {
    expect<(output: Output, raw: Decoded) => Effect<void, never, never>>().type.not
      .toBeAssignableTo<Cell.WritePhase<Shape>>()
  })
})
