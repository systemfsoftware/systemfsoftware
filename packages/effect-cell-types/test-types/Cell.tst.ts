import { Cell } from '@systemfsoftware/effect-cell-types'
import type { Effect } from 'effect/Effect'
import type { Either } from 'effect/Either'
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

// An effect handed to each pure slot. A pure slot's return type is a plain value or an
// `Either`, so an effect in that position fails assignability with no lint rule involved.
declare const decodeReturningEffect: (raw: Raw) => Effect<Decoded, DecodeErr, never>
declare const decideReturningEffect: (decoded: Decoded) => Effect<Decision, Refusal, never>
declare const encodeReturningEffect: (outcome: Either<Decision, Refusal>) => Effect<Output, never, never>
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
  it('Should_RejectEffectReturningDecode_When_SlotRequiresEither', () => {
    expect<typeof Cell.decode<Shape>>().type.not.toBeCallableWith(readStage, decodeReturningEffect)
  })

  it('Should_RejectEffectReturningDecide_When_SlotRequiresEither', () => {
    expect<typeof Cell.decide<Shape>>().type.not.toBeCallableWith(decodeStage, decideReturningEffect)
  })

  it('Should_RejectEffectReturningEncode_When_SlotRequiresAPlainValue', () => {
    expect<typeof Cell.encode<Shape>>().type.not.toBeCallableWith(decideStage, encodeReturningEffect)
  })

  it('Should_AcceptEitherReturningDecode_When_SlotRequiresEither', () => {
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
  it('Should_HandBothBranchesToEncode_When_DecideReturnsEither', () => {
    expect<Cell.EncodePhase<Shape>>().type.toBe<(outcome: Either<Decision, Refusal>) => Output>()
  })

  it('Should_KeepDecodeErrorSeparate_When_DecisionErrorIsAnOutcome', () => {
    expect<Cell.DecodePhase<Shape>>().type.toBe<(raw: Raw) => Either<Decoded, DecodeErr>>()
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
