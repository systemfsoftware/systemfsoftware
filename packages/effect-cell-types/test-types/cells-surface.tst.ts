import { Cell, Sandwich, Workflow } from '@systemfsoftware/effect-cell-types'
import { pipe } from 'effect'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import type { Option } from 'effect/Option'
import type { Pipeable } from 'effect/Pipeable'
import { describe, expect, it } from 'tstyche'

import type * as Result from 'effect/Result'
import { acceptTaggedCommand } from '../tests/__fixtures__/accept-tagged-command.workflow.js'
import type { DecisionOne, DecisionTwo, TaggedCmd } from '../tests/__fixtures__/accept-tagged-command.workflow.js'
import { admitDecodedCommand, Decoded } from '../tests/__fixtures__/admit-decoded-command.workflow.js'
import { admitWideCommand, WideCommand } from '../tests/__fixtures__/admit-wide-command.workflow.js'
import type { CommandRefused } from '../tests/__fixtures__/Command.fixture.js'
import { PublishDecisions, publishDecisions } from '../tests/__fixtures__/publish-decisions.workflow.js'

type Top<A = unknown> = A
type TopCell<A, E = never, R = never, I = unknown> = Cell.Cell<I, A, E, R>
type Phases = readonly ['read', 'decode', 'decide', 'encode', 'write']

interface Cmd {
  readonly id: string
}

interface ReadErr {
  readonly offline: true
}

interface WriteErr {
  readonly full: true
}

interface Db {
  readonly query: () => string
}

interface Bus {
  readonly emit: (line: string) => void
}

interface Clock {
  readonly now: () => number
}

type TaggedEncoded = (typeof TaggedCmd)['Encoded']
type DecodedEncoded = (typeof Decoded)['Encoded']

declare const readTagged: (command: Cmd) => Effect.Effect<TaggedEncoded, never, never>
declare const readDecoded: (command: Cmd) => Effect.Effect<DecodedEncoded, never, never>
declare const readTaggedFailing: (command: Cmd) => Effect.Effect<TaggedEncoded, ReadErr, never>
declare const readTaggedNeedingDb: (command: Cmd) => Effect.Effect<TaggedEncoded, never, Db>
declare const readTaggedNeedingDbAndClock: (command: Cmd) => Effect.Effect<TaggedEncoded, never, Db | Clock>
declare const readDomain: (command: Cmd) => Effect.Effect<{ readonly value: number }, never, never>

type DecisionOneEncoded = (typeof DecisionOne)['Encoded']
type DecisionTwoEncoded = (typeof DecisionTwo)['Encoded']
type CommandRefusedEncoded = (typeof CommandRefused)['Encoded']
type CommandRejectedEncoded = Sandwich.CommandRejected

const answerTagged = {
  DecisionOne: (decision: DecisionOneEncoded, command: TaggedEncoded) => {
    expect(decision).type.toBe<DecisionOneEncoded>()
    expect(command).type.toBe<TaggedEncoded>()
    return Effect.succeed(decision.value)
  },
  DecisionTwo: (decision: DecisionTwoEncoded) => Effect.succeed(decision.reason.length),
  CommandRefused: (refusal: CommandRefusedEncoded) => Effect.succeed(refusal.why.length),
  CommandRejected: (rejected: CommandRejectedEncoded) => Effect.succeed(rejected.issue.length),
}

const widenedName: string = 'cell.surface'
declare const command: Cmd
declare const readErr: ReadErr
declare const writeErr: WriteErr
declare const emitOnBus: Effect.Effect<void, never, Bus>
declare const lifted: Effect.Effect<string, ReadErr, Db>
declare const dbContext: Context.Context<Db>
declare const clockContext: Context.Context<Clock>
declare const dbAndClockContext: Context.Context<Db | Clock>

declare const outputCell: Cell.Cell<Cmd, boolean, WriteErr, Bus>
declare const twinCell: Cell.Cell<Cmd, boolean, WriteErr, Bus>
declare const voidCell: Cell.Cell<void, boolean, WriteErr, Bus>
declare const optionReader: Cell.Cell<Cmd, Option<TaggedEncoded>, ReadErr, Db>
declare const optionReaderOverLengths: Cell.Cell<Cmd, Option<number>, ReadErr, Db>
declare const bareReader: Cell.Cell<Cmd, TaggedEncoded, ReadErr, Db>
declare const innerOverEncoded: Cell.Cell<TaggedEncoded, boolean, WriteErr, Bus>
declare const itemCell: Cell.Cell<Cmd, boolean, ReadErr, Db>
declare const itemFallback: Cell.Cell<Cmd, boolean, WriteErr, Bus>
declare const decisionCell: Cell.Cell<boolean, number, WriteErr, Bus>
declare const numberCell: Cell.Cell<Cmd, number, WriteErr, Bus>

type PublishInput = { readonly count: number }

declare const readPublishing: (
  command: PublishInput,
) => Effect.Effect<(typeof PublishDecisions)['Encoded'], never, never>

type WideInput = { readonly n: number }

declare const readWide: (command: WideInput) => Effect.Effect<(typeof WideCommand)['Encoded'], never, never>

describe('the operation name the constructor accepts', () => {
  it('Should_AcceptAStaticLiteral_When_TheNameCarriesNoUnit', () => {
    expect(Sandwich.named).type.toBeCallableWith('order.submit')
    expect(Sandwich.named).type.not.toBeCallableWith(widenedName)
    expect(Sandwich.named).type.not.toBeCallableWith('order.submit_ms')
    expect(Sandwich.named).type.not.toBeCallableWith('order.submit_seconds')
    expect(Sandwich.named).type.not.toBeCallableWith('payload_bytes')
  })
})

describe('the sandwich the chain builds', () => {
  it('Should_InferTheCell_When_ReadDecideWriteChain', () => {
    const cell = Sandwich.named('cell.surface')(readTagged).decide(acceptTaggedCommand).write(answerTagged)
    expect(cell).type.toBe<Cell.Cell<Cmd, number, never, never> & { readonly phases: Phases }>()
  })

  it('Should_TypeTheHandlerParameters_When_TheWriteAnswers', () => {
    const cell = Sandwich.named('cell.surface')(readTagged).decide(acceptTaggedCommand).write({
      DecisionOne: (decision, command) => {
        expect(decision).type.toBe<DecisionOneEncoded>()
        expect(command).type.toBe<TaggedEncoded>()
        return Effect.succeed(decision.value)
      },
      DecisionTwo: (decision) => Effect.succeed(decision.reason.length),
      CommandRefused: (refusal) => Effect.succeed(refusal.why.length),
      CommandRejected: (rejected) => Effect.succeed(rejected.issue.length),
    })
    expect(cell).type.toBe<Cell.Cell<Cmd, number, never, never> & { readonly phases: Phases }>()
  })

  it('Should_UnionTheHandlerChannels_When_HandlersFailDifferently', () => {
    const cell = Sandwich.named('cell.surface')(readTagged).decide(acceptTaggedCommand).write({
      DecisionOne: (decision) => Effect.succeed(decision.value),
      DecisionTwo: () => Effect.fail(readErr),
      CommandRefused: (refusal) => Effect.succeed(refusal.why),
      CommandRejected: () => Effect.fail(writeErr),
    })
    expect(cell).type.toBe<Cell.Cell<Cmd, number | string, ReadErr | WriteErr, never> & { readonly phases: Phases }>()
  })

  it('Should_ExposeCellTypeUnderSandwich_When_Imported', () => {
    expect<Sandwich.Cell<Cmd, number, never, never>>().type.toBe<Cell.Cell<Cmd, number, never, never>>()
  })

  it('Should_InferSandwichCell_When_ChainingPhases', () => {
    const cell = Sandwich.named('cell.surface')(readTagged).decide(acceptTaggedCommand).write(answerTagged)
    expect(cell).type.toBeAssignableTo<Sandwich.Cell<Cmd, number, never, never>>()
  })

  it('Should_UnionTheErrorChannel_When_ReadCanFail', () => {
    const cell = Sandwich.named('cell.surface')(readTaggedFailing).decide(acceptTaggedCommand).write(answerTagged)
    expect(cell).type.toBe<Cell.Cell<Cmd, number, ReadErr, never> & { readonly phases: Phases }>()
  })

  it('Should_UnionTheServices_When_TheReadRequiresThem', () => {
    const cell = Sandwich.named('cell.surface')(readTaggedNeedingDb).decide(acceptTaggedCommand).write(answerTagged)
    expect(cell).type.toBe<Cell.Cell<Cmd, number, never, Db> & { readonly phases: Phases }>()
  })

  it('Should_RunTheRealCell_When_TheArrowIsApplied', () => {
    const cell = Sandwich.named('cell.surface')(readTagged).decide(acceptTaggedCommand).write(answerTagged)
    expect(cell.run(command)).type.toBe<Effect.Effect<number, never, never>>()
  })
})

describe('the handler record the write holds exhaustive', () => {
  it('Should_RefuseTheWrite_When_OneDecisionTagHasNoHandler', () => {
    const decided = Sandwich.named('cell.surface')(readTagged).decide(acceptTaggedCommand)
    expect<typeof decided.write>().type.toBeCallableWith(answerTagged)
    expect<typeof decided.write>().type.not.toBeCallableWith({
      DecisionOne: () => Effect.succeed(1),
      CommandRefused: () => Effect.succeed(2),
      CommandRejected: () => Effect.succeed(3),
    })
  })

  it('Should_RefuseTheWrite_When_AnErrorTagHasNoHandler', () => {
    const decided = Sandwich.named('cell.surface')(readTagged).decide(acceptTaggedCommand)
    expect<typeof decided.write>().type.not.toBeCallableWith({
      DecisionOne: () => Effect.succeed(1),
      DecisionTwo: () => Effect.succeed(2),
      CommandRejected: () => Effect.succeed(3),
    })
  })

  it('Should_RefuseTheWrite_When_TheRejectionEnvelopeHasNoHandler', () => {
    const decided = Sandwich.named('cell.surface')(readTagged).decide(acceptTaggedCommand)
    expect<typeof decided.write>().type.not.toBeCallableWith({
      DecisionOne: () => Effect.succeed(1),
      DecisionTwo: () => Effect.succeed(2),
      CommandRefused: () => Effect.succeed(3),
    })
  })

  it('Should_RefuseTheWrite_When_OneHandlerKeyNamesNoVariant', () => {
    const decided = Sandwich.named('cell.surface')(readTagged).decide(acceptTaggedCommand)
    expect<typeof decided.write>().type.toBeCallableWith(answerTagged)
    expect<typeof decided.write>().type.not.toBeCallableWith({
      ...answerTagged,
      DecisionThree: () => Effect.succeed(4),
    })
  })

  it('Should_RefuseAHandler_When_ItsParameterIsTheDomainType', () => {
    const decided = Sandwich.named('cell.surface')(readTagged).decide(acceptTaggedCommand)
    expect<typeof decided.write>().type.not.toBeCallableWith({
      DecisionOne: (decision: DecisionOne, _command: TaggedEncoded) => Effect.succeed(decision.value),
      DecisionTwo: () => Effect.succeed(2),
      CommandRefused: () => Effect.succeed(3),
      CommandRejected: () => Effect.succeed(4),
    })
  })

  it('Should_RefuseAHandler_When_ItsCommandParameterIsNotTheReadValue', () => {
    const decided = Sandwich.named('cell.surface')(readTagged).decide(acceptTaggedCommand)
    expect<typeof decided.write>().type.not.toBeCallableWith({
      DecisionOne: (decision: DecisionOneEncoded, _command: Cmd) => Effect.succeed(decision.value),
      DecisionTwo: () => Effect.succeed(2),
      CommandRefused: () => Effect.succeed(3),
      CommandRejected: () => Effect.succeed(4),
    })
  })
})

describe('the read the chain holds to the command encoding', () => {
  it('Should_RefuseTheChain_When_TheReadYieldsTheDomainValue', () => {
    const taggedChain = Sandwich.named('cell.surface')(readTagged).decide(acceptTaggedCommand)
    const domainChain = Sandwich.named('cell.surface')(readDomain).decide(acceptTaggedCommand)
    expect(taggedChain).type.toBeAssignableTo<{ readonly write: Top }>()
    expect(domainChain).type.not.toBeAssignableTo<{ readonly write: Top }>()
  })
})

describe('the five phases the chain records', () => {
  it('Should_RefuseTheWrite_When_TheChainSkipsDecide', () => {
    const lawful = Sandwich.named('cell.surface')(readTagged).decide(acceptTaggedCommand)
    expect(lawful).type.toBeAssignableTo<{ readonly write: Top }>()
    expect(Sandwich.named('cell.surface')(readTagged)).type.not.toBeAssignableTo<{ readonly write: Top }>()
  })

  it('Should_PinThePhasesTuple_When_TheWriteAnswers', () => {
    const cell = Sandwich.named('cell.surface')(readTagged).decide(acceptTaggedCommand).write(answerTagged)
    expect(cell.phases).type.toBe<Phases>()
  })
})

describe('the event-list decision the write answers in order', () => {
  it('Should_InferTheEventListCell_When_TheDecisionIsAnArray', () => {
    const cell = Sandwich.named('cell.events')(readPublishing).decide(publishDecisions).write({
      DecisionOne: () => Effect.succeed(1),
      DecisionTwo: () => Effect.succeed(2),
      CommandRejected: () => Effect.succeed(0),
    })
    expect(cell).type.toBe<
      Cell.Cell<PublishInput, ReadonlyArray<number>, never, never> & { readonly phases: Phases }
    >()
  })

  it('Should_TypeTheEventParameter_When_TheHandlerAnswersAnEvent', () => {
    const cell = Sandwich.named('cell.events')(readPublishing).decide(publishDecisions).write({
      DecisionOne: (event, command) => {
        expect(event).type.toBe<DecisionOneEncoded>()
        expect(command).type.toBe<(typeof PublishDecisions)['Encoded']>()
        return Effect.succeed(1)
      },
      DecisionTwo: () => Effect.succeed(2),
      CommandRejected: () => Effect.succeed(0),
    })
    expect(cell).type.toBe<
      Cell.Cell<PublishInput, ReadonlyArray<number>, never, never> & { readonly phases: Phases }
    >()
  })
})

describe('the twelve-variant record the write still holds exhaustive', () => {
  const answerWide = {
    WideOne: () => Effect.succeed(1),
    WideTwo: () => Effect.succeed(2),
    WideThree: () => Effect.succeed(3),
    WideFour: () => Effect.succeed(4),
    WideFive: () => Effect.succeed(5),
    WideSix: () => Effect.succeed(6),
    WideSeven: () => Effect.succeed(7),
    WideEight: () => Effect.succeed(8),
    WideNine: () => Effect.succeed(9),
    WideTen: () => Effect.succeed(10),
    WideEleven: () => Effect.succeed(11),
    WideTwelve: () => Effect.succeed(12),
    DecisionError: () => Effect.succeed(0),
    CommandRejected: () => Effect.succeed(0),
  }

  it('Should_TypecheckTheWholeRecord_When_AllFourteenKeysAnswer', () => {
    const cell = Sandwich.named('cell.wide')(readWide).decide(admitWideCommand).write(answerWide)
    expect(cell).type.toBe<Cell.Cell<WideInput, number, never, never> & { readonly phases: Phases }>()
  })

  it('Should_RefuseTheRecord_When_OneVariantLosesItsHandler', () => {
    const decided = Sandwich.named('cell.wide')(readWide).decide(admitWideCommand)
    const { WideTwelve: _dropped, ...incomplete } = answerWide
    expect<typeof decided.write>().type.not.toBeCallableWith(incomplete)
  })
})

describe('the decoded admission cell the fixture builds', () => {
  it('Should_InferTheAdmissionCell_When_TheFixturesAnswerEveryTag', () => {
    const cell = Sandwich.named('cell.admission')(readDecoded).decide(admitDecodedCommand).write({
      Admitted: (decision, _command) => Effect.succeed(decision.length),
      Rejected: (decision, _command) => Effect.succeed(decision.why.length),
      Malformed: (refusal, _command) => Effect.succeed(refusal.length),
      CommandRejected: (rejected, _command) => Effect.succeed(rejected.issue.length),
    })
    expect(cell).type.toBe<Cell.Cell<Cmd, number, never, never> & { readonly phases: Phases }>()
  })
})

describe('the provideContext that clears the services', () => {
  it('Should_NarrowRToNever_When_TheOneServiceIsProvided', () => {
    const cell = Sandwich.named('cell.surface')(readTaggedNeedingDb).decide(acceptTaggedCommand).write(answerTagged)
    const provided = pipe(cell, Cell.provideContext(dbContext))
    expect(provided).type.toBe<Cell.Cell<Cmd, number, never, never>>()
    expect(provided.run(command)).type.toBe<Effect.Effect<number, never, never>>()
  })

  it('Should_ReadTheSameCell_When_ProvidingDataFirst', () => {
    const cell = Sandwich.named('cell.surface')(readTaggedNeedingDb).decide(acceptTaggedCommand).write(answerTagged)
    expect(Cell.provideContext(cell, dbContext)).type.toBe<Cell.Cell<Cmd, number, never, never>>()
  })

  it('Should_KeepTheUnprovidedServices_When_TheContextCarriesSome', () => {
    const cell = Sandwich.named('cell.surface')(readTaggedNeedingDbAndClock).decide(acceptTaggedCommand).write(
      answerTagged,
    )
    const once = pipe(cell, Cell.provideContext(dbAndClockContext))
    expect(once).type.toBe<Cell.Cell<Cmd, number, never, never>>()
    const twice = pipe(
      Sandwich.named('cell.surface')(readTaggedNeedingDbAndClock).decide(acceptTaggedCommand).write(answerTagged),
      Cell.provideContext(dbContext),
    )
    expect(twice).type.toBe<Cell.Cell<Cmd, number, never, Clock>>()
    expect(pipe(twice, Cell.provideContext(clockContext))).type.toBe<Cell.Cell<Cmd, number, never, never>>()
  })

  it('Should_RetireTheLayerProvide_When_TheContextIsTheOnlyBinding', () => {
    expect<typeof Cell>().type.not.toBeAssignableTo<{ readonly provide: Top }>()
    expect<typeof Cell>().type.toBeAssignableTo<{ readonly provideContext: Top }>()
  })
})

describe('the surface the library retired', () => {
  it('Should_ExposeNoPurePhaseOrChainSteps_When_TheEdgesAreDerived', () => {
    expect<typeof Sandwich>().type.not.toBeAssignableTo<{ readonly pure: Top }>()
    expect<typeof Sandwich>().type.not.toBeAssignableTo<{ readonly decode: Top }>()
    expect<typeof Sandwich>().type.not.toBeAssignableTo<{ readonly encode: Top }>()
  })

  it('Should_ExposeNoTotalOrAndThen_When_TheConstructorIsTheOnlyOne', () => {
    expect<typeof Workflow>().type.not.toBeAssignableTo<{ readonly total: Top }>()
    expect<typeof Workflow>().type.not.toBeAssignableTo<{ readonly andThen: Top }>()
    expect<typeof Workflow>().type.not.toBeAssignableTo<{ readonly UninhabitedError: Top }>()
  })
})

describe('the combinator algebra', () => {
  it('Should_PreserveEveryChannel_When_MappingTheResponse', () => {
    const mapped = pipe(
      outputCell,
      Cell.map((verdict: boolean): number => {
        if (verdict) return 1
        return 0
      }),
    )
    expect(mapped).type.toBe<Cell.Cell<Cmd, number, WriteErr, Bus>>()
  })

  it('Should_TransformTheInput_When_MappingInput', () => {
    const remapped = pipe(outputCell, Cell.mapInput((s: string) => ({ id: s })))
    expect(remapped).type.toBe<Cell.Cell<string, boolean, WriteErr, Bus>>()
  })

  it('Should_FeedTheResponseToTheNext_When_AndThenChains', () => {
    const chained = pipe(
      Sandwich.named('cell.surface')(readTagged).decide(acceptTaggedCommand).write(answerTagged),
      Cell.andThen(voidCell),
    )
    expect(chained).type.toBe<Cell.Cell<Cmd, boolean, WriteErr, Bus>>()
  })

  it('Should_TupleTheResponses_When_Zipping', () => {
    const cell = Sandwich.named('cell.surface')(readTagged).decide(acceptTaggedCommand).write(answerTagged)
    const zipped = pipe(cell, Cell.zip(twinCell))
    expect(zipped).type.toBe<Cell.Cell<Cmd, readonly [number, boolean], WriteErr, Bus>>()
  })

  it('Should_WrapTheInnerResponse_When_GateAdmitsTheReaderValue', () => {
    const gated = pipe(optionReader, Cell.gate(innerOverEncoded))
    expect(gated).type.toBe<Cell.Cell<Cmd, Option<boolean>, ReadErr | WriteErr, Db | Bus>>()
    expect(gated.run(command)).type.toBe<Effect.Effect<Option<boolean>, ReadErr | WriteErr, Db | Bus>>()
  })

  it('Should_ReadTheSameCell_When_GateIsCalledDataFirst', () => {
    expect(Cell.gate(optionReader, innerOverEncoded)).type.toBe<
      Cell.Cell<Cmd, Option<boolean>, ReadErr | WriteErr, Db | Bus>
    >()
  })

  it('Should_RefuseTheInner_When_ItsInputIsNotTheReaderValue', () => {
    expect<typeof Cell.gate>().type.not.toBeCallableWith(optionReaderOverLengths, innerOverEncoded)
  })

  it('Should_RefuseAReader_When_ItCarriesNoOption', () => {
    expect<typeof Cell.gate>().type.not.toBeCallableWith(bareReader, innerOverEncoded)
  })

  it('Should_NameTheCollectionInput_When_CollectingOverItems', () => {
    const fold = (responses: readonly boolean[]): number => responses.length
    const folded = Cell.collect(itemCell, fold)
    expect(folded).type.toBe<Cell.Cell<readonly Cmd[], number, ReadErr, Db>>()
    expect(folded.run([command])).type.toBe<Effect.Effect<number, ReadErr, Db>>()
  })

  it('Should_BindTheFoldFirst_When_CollectingDataLast', () => {
    const folded = pipe(itemCell, Cell.collect((responses: readonly boolean[]): number => responses.length))
    expect(folded).type.toBe<Cell.Cell<readonly Cmd[], number, ReadErr, Db>>()
  })

  it('Should_RefuseAMutableFold_When_TheFoldReceivesReadonlyResponses', () => {
    expect<typeof Cell.collect>().type.not.toBeCallableWith(itemCell, (responses: boolean[]) => responses.length)
  })

  it('Should_HandEveryResultToTheFold_When_Accumulating', () => {
    const fold = (results: readonly Result.Result<boolean, ReadErr>[]): number => results.length
    const accumulated = Cell.collectAll(itemCell, fold)
    expect(accumulated).type.toBe<Cell.Cell<readonly Cmd[], number, never, Db>>()
    expect(accumulated.run([command])).type.toBe<Effect.Effect<number, never, Db>>()
  })

  it('Should_NotInheritTheItemErrorChannel_When_TheConsumerEffectWrapsTheCell', () => {
    const fold = (results: readonly Result.Result<boolean, ReadErr>[]): number => results.length
    const consumed = pipe(
      Cell.collectAll(itemCell, fold).run([command]),
      Effect.map((count) => count + 1),
    )
    expect(consumed).type.toBe<Effect.Effect<number, never, Db>>()
  })
})

describe('the variance the Cell carries', () => {
  it('Should_AcceptTheWiderCommand_When_TheNarrowerIsExpected', () => {
    expect<Cell.Cell<Cmd, void, never, never>>().type.toBeAssignableTo<Cell.Cell<{ id: string }, void, never, never>>()
  })

  it('Should_AcceptTheWiderResponse_When_TheNarrowerIsExpected', () => {
    expect<Cell.Cell<Cmd, boolean, never, never>>().type.toBeAssignableTo<
      Cell.Cell<Cmd, boolean | void, never, never>
    >()
  })

  it('Should_AcceptTheWiderError_When_TheNarrowerIsExpected', () => {
    expect<Cell.Cell<Cmd, void, WriteErr, never>>().type.toBeAssignableTo<
      Cell.Cell<Cmd, void, WriteErr | ReadErr, never>
    >()
  })

  it('Should_AcceptTheWiderServices_When_TheNarrowerIsExpected', () => {
    expect<Cell.Cell<Cmd, void, never, Bus>>().type.toBeAssignableTo<Cell.Cell<Cmd, void, never, Bus | Clock>>()
  })

  it('Should_PipeValues_When_TheCellCarriesPipeable', () => {
    expect<Cell.Cell<Cmd, void, never, never>>().type.toBeAssignableTo<Pipeable>()
    expect<Cell.Cell<Cmd, void, never, never>>().type.toBeAssignableTo<Cell.Cell<Cmd, void, never, never> & Pipeable>()
  })

  it('Should_PipeThePipedResult_When_NestingInstancePipes', () => {
    const cell = Sandwich.named('cell.surface')(readTagged).decide(acceptTaggedCommand).write(answerTagged)
    const piped = cell.pipe(Cell.map((_response: number): string => `${_response}`))
    expect(piped).type.toBe<Cell.Cell<Cmd, string, never, never>>()
    expect(piped.pipe(Cell.map((line: string): number => line.length))).type.toBe<
      Cell.Cell<Cmd, number, never, never>
    >()
  })

  it('Should_GateTheBrand_When_UnbrandedValueIsExpected', () => {
    expect<{ readonly run: (input: Cmd) => Effect.Effect<void, never, never> }>().type.not.toBeAssignableTo<
      Cell.Cell<Cmd, void, never, never>
    >()
  })
})

describe('the constructor arrows', () => {
  it('Should_LiftTheConstant_When_Succeeding', () => {
    expect(Cell.succeed(7)).type.toBe<TopCell<number>>()
    expect(Cell.succeed(7).run(command)).type.toBe<Effect.Effect<number, never, never>>()
  })

  it('Should_LiftTheFailure_When_Failing', () => {
    expect(Cell.fail(readErr)).type.toBe<TopCell<never, ReadErr>>()
  })

  it('Should_CarryTheChannels_When_LiftingAnEffect', () => {
    expect(Cell.fromEffect(lifted)).type.toBe<TopCell<string, ReadErr, Db>>()
  })

  it('Should_DeferConstruction_When_Suspending', () => {
    expect(Cell.suspend(() => itemCell)).type.toBe<Cell.Cell<Cmd, boolean, ReadErr, Db>>()
  })

  it('Should_EchoTheInput_When_Id', () => {
    expect(Cell.id<Cmd>()).type.toBe<Cell.Cell<Cmd, Cmd, never, never>>()
    expect(Cell.id<Cmd>().run(command)).type.toBe<Effect.Effect<Cmd, never, never>>()
  })

  it('Should_AcceptAnyInput_When_SupplyingAConstant', () => {
    expect<TopCell<number>>().type.toBeAssignableTo<Cell.Cell<Cmd, number, never, never>>()
  })

  it('Should_AcceptAnyInput_When_LiftingAnEffect', () => {
    expect<TopCell<number>>().type.toBeAssignableTo<Cell.Cell<Cmd, number, never, never>>()
  })
})

describe('the error-channel arrows', () => {
  it('Should_RemapTheFailure_When_MappingTheError', () => {
    const remapped = pipe(itemCell, Cell.mapError((_error: ReadErr): string => 'offline'))
    expect(remapped).type.toBe<Cell.Cell<Cmd, boolean, string, Db>>()
    expect(remapped.run(command)).type.toBe<Effect.Effect<boolean, string, Db>>()
  })

  it('Should_ReadTheSameCell_When_MappingTheErrorDataFirst', () => {
    expect(Cell.mapError(itemCell, (_error: ReadErr): string => 'offline')).type.toBe<
      Cell.Cell<Cmd, boolean, string, Db>
    >()
  })

  it('Should_NarrowToTheFallbackError_When_Recovering', () => {
    const recovered = pipe(itemCell, Cell.orElse(itemFallback))
    expect(recovered).type.toBe<Cell.Cell<Cmd, boolean, WriteErr, Db | Bus>>()
  })

  it('Should_ReadTheSameCell_When_RecoveringDataFirst', () => {
    expect(Cell.orElse(itemCell, itemFallback)).type.toBe<Cell.Cell<Cmd, boolean, WriteErr, Db | Bus>>()
  })

  it('Should_RefuseAFallback_When_ItsInputIsNotTheCommand', () => {
    expect<typeof Cell.orElse>().type.not.toBeCallableWith(itemCell, innerOverEncoded)
  })

  it('Should_UnionTheChannels_When_Observing', () => {
    const observed = pipe(
      itemCell,
      Cell.tap(() => lifted),
    )
    expect(observed).type.toBe<Cell.Cell<Cmd, boolean, ReadErr, Db>>()
  })

  it('Should_UnionTheObserverServices_When_TheObserverNeedsMore', () => {
    const observed = pipe(
      itemCell,
      Cell.tap(() => emitOnBus),
    )
    expect(observed).type.toBe<Cell.Cell<Cmd, boolean, ReadErr, Db | Bus>>()
  })
})

describe('the sequencing arrows and the match destructor', () => {
  it('Should_ThreadTheSameInput_When_FlatMapping', () => {
    const flatMapped = pipe(
      itemCell,
      Cell.flatMap((_decision: boolean): Cell.Cell<Cmd, number, WriteErr, Bus> => numberCell),
    )
    expect(flatMapped).type.toBe<Cell.Cell<Cmd, number, ReadErr | WriteErr, Db | Bus>>()
  })

  it('Should_RefuseTheInner_When_FlatMapDemandsADifferentInput', () => {
    expect<typeof Cell.flatMap>().type.not.toBeCallableWith(itemCell, (_decision: boolean) => innerOverEncoded)
  })

  it('Should_CombineOverOneInput_When_ZippingWith', () => {
    const combined = pipe(
      itemCell,
      Cell.zipWith(itemFallback, (_first: boolean, _second: boolean): string => 'paired'),
    )
    expect(combined).type.toBe<Cell.Cell<Cmd, string, ReadErr | WriteErr, Db | Bus>>()
    expect(combined.run(command)).type.toBe<Effect.Effect<string, ReadErr | WriteErr, Db | Bus>>()
  })

  it('Should_FeedTheResponse_When_AndThenTakesAFunction', () => {
    const dynamic = pipe(
      itemCell,
      Cell.andThen((_decision: boolean): Cell.Cell<boolean, number, WriteErr, Bus> => decisionCell),
    )
    expect(dynamic).type.toBe<Cell.Cell<Cmd, number, ReadErr | WriteErr, Db | Bus>>()
  })

  it('Should_RefuseTheBuiltCell_When_ItsInputIsNotTheResponse', () => {
    expect<typeof Cell.andThen>().type.not.toBeCallableWith(itemCell, (_decision: boolean) => innerOverEncoded)
  })

  it('Should_FoldTheOutcome_When_Matching', () => {
    const folded = pipe(
      itemCell,
      Cell.match({
        onFailure: (_error: ReadErr): string => 'down',
        onSuccess: (_decision: boolean): number => 1,
      }),
    )
    expect(folded).type.toBe<Cell.Cell<Cmd, string | number, never, Db>>()
    expect(folded.run(command)).type.toBe<Effect.Effect<string | number, never, Db>>()
  })

  it('Should_ComposeFurther_When_MatchedCellZips', () => {
    const folded = pipe(
      itemCell,
      Cell.match({
        onFailure: (_error: ReadErr): string => 'down',
        onSuccess: (_decision: boolean): number => 1,
      }),
    )
    const paired = pipe(folded, Cell.zip(itemFallback))
    expect(paired).type.toBe<Cell.Cell<Cmd, readonly [string | number, boolean], WriteErr, Db | Bus>>()
  })
})

describe('the Do chain over the TypeLambda', () => {
  it('Should_TypeDoAsContravariantInputUnknown_When_Initialized', () => {
    expect(Cell.Do).type.toBe<TopCell<{}>>()
  })

  it('Should_AccumulateTheRecord_When_BindingOntoDo', () => {
    const chained = pipe(
      Cell.Do,
      Cell.bind('decision', (): Cell.Cell<Cmd, boolean, ReadErr, Db> => itemCell),
      Cell.bind('count', (): Cell.Cell<Cmd, number, WriteErr, Bus> => numberCell),
      Cell.let('line', ({ count }: { readonly count: number }): string => `seen:${count}`),
    )
    expect(chained).type.toBe<
      Cell.Cell<
        Cmd,
        Record<'decision', boolean> & Record<'count', number> & Record<'line', string>,
        ReadErr | WriteErr,
        Db | Bus
      >
    >()
  })

  it('Should_NarrowTheInput_When_BindingDirectlyOntoDo', () => {
    const narrowed = pipe(
      Cell.Do,
      Cell.bind('decision', (): Cell.Cell<Cmd, boolean, ReadErr, Db> => itemCell),
    )
    expect(narrowed).type.toBe<Cell.Cell<Cmd, Record<'decision', boolean>, ReadErr, Db>>()
  })

  it('Should_RefuseTheInner_When_BindDemandsADifferentInput', () => {
    expect<typeof Cell.bind>().type.not.toBeCallableWith(
      itemCell,
      'raw',
      (_scope: { readonly decision: boolean }) => innerOverEncoded,
    )
  })

  it('Should_WrapTheValue_When_BindingToAName', () => {
    expect(Cell.bindTo(itemCell, 'v')).type.toBe<
      Cell.Cell<Cmd, Record<'v', boolean>, ReadErr, Db>
    >()
  })

  it('Should_ThreadTheScope_When_LettingAPureField', () => {
    const chained = pipe(
      Cell.Do,
      Cell.bind('decision', (): Cell.Cell<Cmd, boolean, ReadErr, Db> => itemCell),
      Cell.let('admitted', ({ decision }: { readonly decision: boolean }): boolean => decision),
    )
    expect(chained).type.toBe<
      Cell.Cell<Cmd, Record<'decision', boolean> & Record<'admitted', boolean>, ReadErr, Db>
    >()
  })
})
