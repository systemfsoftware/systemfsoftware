import { Cell, Sandwich, Workflow } from '@systemfsoftware/effect-cell-types'
import { pipe } from 'effect'
import type { Effect } from 'effect/Effect'
import { map } from 'effect/Effect'
import type { Layer } from 'effect/Layer'
import type { Option } from 'effect/Option'
import type { Pipeable } from 'effect/Pipeable'
import * as Result from 'effect/Result'
import { describe, expect, it } from 'tstyche'

import { chainAdmitTaggedCommands } from '../tests/__fixtures__/chain-admit-tagged-commands.workflow.js'
import { CommandRefused, TaggedCmd } from '../tests/__fixtures__/Command.schema.js'
import { type Decision as TotalDecision, DecisionError } from '../tests/__fixtures__/Decision.schema.js'
import { totalAdmitTaggedCommand } from '../tests/__fixtures__/total-admit-tagged-command.workflow.js'

type Top<A = unknown> = A
type TopCell<A, E = never, R = never, I = unknown> = Cell.Cell<I, A, E, R>

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

declare const read: (command: Cmd) => Effect<Raw, never, never>
declare const readFailing: (command: Cmd) => Effect<Raw, ReadErr, never>
declare const readNeedingDb: (command: Cmd) => Effect<Raw, never, Db>
declare const readNeedingClock: (command: Cmd) => Effect<Raw, never, Clock>
declare const readNeedingDbAndClock: (command: Cmd) => Effect<Raw, never, Db | Clock>
declare const decode: (raw: Raw) => Result.Result<Decoded, DecodeErr>
declare const decideOverRaw: Workflow.Workflow<Raw, Decision, Refusal>
declare const decideOverDecoded: Workflow.Workflow<Decoded, Decision, Refusal>
declare const decideUnbranded: (decoded: Raw) => Result.Result<Decision, Refusal>
declare const decideUnbrandedChain: (command: TaggedCmd) => Result.Result<TotalDecision, CommandRefused | DecisionError>
declare const encode: (outcome: Result.Result<Decision, Refusal>) => Output
declare const encodeResult: (outcome: Result.Result<Decision, Refusal>) => Result.Result<Output, never>
declare const succeedDecoded: (raw: Raw) => Result.Result<Decoded, DecodeErr>
declare const writeOutcome: (outcome: Result.Result<Decision, Refusal>, raw: Raw) => Effect<void, never, never>
declare const writeOutcomeFailing: (
  outcome: Result.Result<Decision, Refusal>,
  raw: Raw,
) => Effect<void, WriteErr, never>
declare const writeOutcomeUnary: (outcome: Result.Result<Decision, Refusal>) => Effect<void, never, never>
declare const writeOutcomeWrongRaw: (
  outcome: Result.Result<Decision, Refusal>,
  raw: Decoded,
) => Effect<void, never, never>
declare const writeOutcomeNeedingBus: (outcome: Result.Result<Decision, Refusal>, raw: Raw) => Effect<void, never, Bus>
declare const writeOutput: (output: Output, raw: Raw) => Effect<void, never, never>
declare const writeOutputNeedingBus: (output: Output, raw: Raw) => Effect<void, never, Bus>
declare const command: Cmd
declare const observeOnBus: (decision: Decision) => Effect<void, never, Bus>
declare const dbLayer: Layer<Db, never, never>
declare const readErr: ReadErr
declare const lifted: Effect<string, ReadErr, Db>
declare const succeedSeven: Effect<number, never, never>
declare const failingDbLayer: Layer<Db, ReadErr, never>
declare const clockLayer: Layer<Clock, never, never>
declare const dbFromClock: Layer<Db, never, Clock>

declare const outputCell: Cell.Cell<Output, boolean, WriteErr, Bus>
declare const twinCell: Cell.Cell<Cmd, boolean, WriteErr, Bus>
declare const voidCell: Cell.Cell<void, boolean, WriteErr, Bus>
declare const optionReader: Cell.Cell<Cmd, Option<Raw>, ReadErr, Db>
declare const optionReaderOverLengths: Cell.Cell<Cmd, Option<Decoded>, ReadErr, Db>
declare const bareReader: Cell.Cell<Cmd, Raw, ReadErr, Db>
declare const innerOverRaw: Cell.Cell<Raw, Decision, WriteErr, Bus>
declare const itemCell: Cell.Cell<Cmd, Decision, ReadErr, Db>
declare const itemFallback: Cell.Cell<Cmd, Decision, WriteErr, Bus>
declare const decisionCell: Cell.Cell<Decision, number, WriteErr, Bus>
declare const numberCell: Cell.Cell<Cmd, number, WriteErr, Bus>
declare const readTagged: (command: Cmd) => Effect<TaggedCmd, never, never>
declare const writeTotalOutcome: (
  outcome: Result.Result<TotalDecision, never>,
  raw: TaggedCmd,
) => Effect<void, never, never>
declare const writeChainedOutcome: (
  outcome: Result.Result<TotalDecision, CommandRefused | DecisionError>,
  raw: TaggedCmd,
) => Effect<void, never, never>
declare const widenedName: string

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
    const cell = Sandwich.named('cell.surface')(read).decide(decideOverRaw).write(writeOutcome)
    expect(cell).type.toBe<
      Cell.Cell<Cmd, void, never, never> & { readonly phases: readonly ['read', 'decide', 'write'] }
    >()
  })

  it('Should_InferTheCell_When_AllFivePhasesChain', () => {
    const cell = Sandwich.named('cell.surface')(read).decode(Sandwich.pure(decode)).decide(decideOverDecoded).encode(
      Sandwich.pure((outcome) => outcome.pipe(encode, Result.succeed)),
    ).write(writeOutput)
    expect(cell).type.toBe<
      Cell.Cell<Cmd, void, DecodeErr, never> & {
        readonly phases: readonly ['read', 'decode', 'decide', 'encode', 'write']
      }
    >()
  })

  it('Should_ExposeCellTypeUnderSandwich_When_Imported', () => {
    expect<Sandwich.Cell<Cmd, void, never, never>>().type.toBe<Cell.Cell<Cmd, void, never, never>>()
  })

  it('Should_InferSandwichCell_When_ChainingPhases', () => {
    const cell = Sandwich.named('cell.surface')(read).decide(decideOverRaw).write(writeOutcome)
    expect(cell).type.toBeAssignableTo<Sandwich.Cell<Cmd, void, never, never>>()
  })

  it('Should_UnionTheErrorChannel_When_ReadAndWriteCanFail', () => {
    const cell = Sandwich.named('cell.surface')(readFailing).decide(decideOverRaw).write(writeOutcomeFailing)
    expect(cell).type.toBe<
      Cell.Cell<Cmd, void, ReadErr | WriteErr, never> & { readonly phases: readonly ['read', 'decide', 'write'] }
    >()
  })

  it('Should_UnionTheServices_When_BothImpurePhasesRequire', () => {
    const cell = Sandwich.named('cell.surface')(readNeedingDb).decide(decideOverRaw).write(writeOutcomeNeedingBus)
    expect(cell).type.toBe<
      Cell.Cell<Cmd, void, never, Db | Bus> & { readonly phases: readonly ['read', 'decide', 'write'] }
    >()
  })
})

describe('the refusal the error channel excludes', () => {
  it('Should_KeepTheDecideRefusalAnOutcome_When_NamingTheErrorChannel', () => {
    const cell = Sandwich.named('cell.surface')(readFailing).decide(decideOverRaw).write(writeOutcomeFailing)
    expect(cell).type.not.toBeAssignableTo<Cell.Cell<Cmd, void, Refusal, never>>()
  })
})

describe('the chains the surface refuses', () => {
  it('Should_RefuseTheWrite_When_DecodeArrivesWithoutEncode', () => {
    expect(Sandwich.named('cell.surface')(read).decode(Sandwich.pure(decode)).decide(decideOverDecoded)).type.not
      .toBeAssignableTo<{
        readonly write: Top
      }>()
  })

  it('Should_RefuseTheEncode_When_EncodeArrivesWithoutDecode', () => {
    expect(Sandwich.named('cell.surface')(read).decide(decideOverRaw)).type.not.toBeAssignableTo<
      { readonly encode: Top }
    >()
  })

  it('Should_RefuseTheDecide_When_TheDecideIsNotAWorkflow', () => {
    const rawChain = Sandwich.named('cell.surface')(read)
    expect<typeof rawChain.decide>().type.not.toBeCallableWith(decideUnbranded)
  })

  it('Should_RefuseTheWrite_When_TheWriteSecondParameterIsNotTheRaw', () => {
    const decided = Sandwich.named('cell.surface')(read).decide(decideOverRaw)
    expect<typeof decided.write>().type.not.toBeCallableWith(writeOutcomeWrongRaw)
  })

  it('Should_RefuseTheDecide_When_ItsInputIsNotTheReadRaw', () => {
    const rawChain = Sandwich.named('cell.surface')(read)
    expect<typeof rawChain.decide>().type.toBeCallableWith(decideOverRaw)
    expect<typeof rawChain.decide>().type.not.toBeCallableWith(decideOverDecoded)
  })

  it('Should_RefuseUnbrandedPurePhase_When_DecodeRequiresPurePhaseBrand', () => {
    const rawChain = Sandwich.named('cell.surface')(read)
    expect<typeof rawChain.decode>().type.toBeCallableWith(Sandwich.pure(decode))
    expect<typeof rawChain.decode>().type.not.toBeCallableWith(decode)
  })
})

describe('the unary write the chain admits', () => {
  it('Should_AdmitAUnaryWrite_When_TheWriteIgnoresTheOutcome', () => {
    const cell = Sandwich.named('cell.surface')(read).decide(decideOverRaw).write(writeOutcomeUnary)
    expect(cell).type.toBe<
      Cell.Cell<Cmd, void, never, never> & { readonly phases: readonly ['read', 'decide', 'write'] }
    >()
  })
})

describe('the run the Cell publishes', () => {
  it('Should_YieldTheChannels_When_TheArrowIsApplied', () => {
    const cell = Sandwich.named('cell.surface')(read).decide(decideOverRaw).write(writeOutcome)
    expect(cell.run(command)).type.toBe<Effect<void, never, never>>()
  })
})

describe('the provide that clears the services', () => {
  it('Should_NarrowRToNever_When_TheOneServiceIsProvided', () => {
    const cell = Sandwich.named('cell.surface')(readNeedingDb).decide(decideOverRaw).write(writeOutcome)
    const provided = pipe(cell, Cell.provide(dbLayer))
    expect(provided).type.toBe<Cell.Cell<Cmd, void, never, never>>()
    expect(provided.run(command)).type.toBe<Effect<void, never, never>>()
  })

  it('Should_UnionTheLayerError_When_TheLayerCanFail', () => {
    const cell = Sandwich.named('cell.surface')(readNeedingDb).decide(decideOverRaw).write(writeOutcome)
    const provided = pipe(cell, Cell.provide(failingDbLayer))
    expect(provided).type.toBe<Cell.Cell<Cmd, void, ReadErr, never>>()
  })

  it('Should_KeepTheLayerInputs_When_TheLayerNeedsServices', () => {
    const cell = Sandwich.named('cell.surface')(readNeedingClock).decide(decideOverRaw).write(writeOutcome)
    const provided = pipe(cell, Cell.provide(dbFromClock))
    expect(provided).type.toBe<Cell.Cell<Cmd, void, never, Clock>>()
  })

  it('Should_NarrowOnlyTheProvidedService_When_ChainingProvides', () => {
    const cell = Sandwich.named('cell.surface')(readNeedingDbAndClock).decide(decideOverRaw).write(writeOutcome)
    const once = pipe(cell, Cell.provide(dbLayer))
    expect(once).type.toBe<Cell.Cell<Cmd, void, never, Clock>>()
    expect(pipe(once, Cell.provide(clockLayer))).type.toBe<Cell.Cell<Cmd, void, never, never>>()
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
    expect(mapped).type.toBe<Cell.Cell<Output, number, WriteErr, Bus>>()
  })

  it('Should_TransformTheInput_When_MappingInput', () => {
    const remapped = pipe(outputCell, Cell.mapInput((s: string) => ({ line: s })))
    expect(remapped).type.toBe<Cell.Cell<string, boolean, WriteErr, Bus>>()
  })

  it('Should_FeedTheResponseToTheNext_When_AndThenChains', () => {
    const chained = pipe(
      Sandwich.named('cell.surface')(read).decide(decideOverRaw).write(writeOutcome),
      Cell.andThen(voidCell),
    )
    expect(chained).type.toBe<Cell.Cell<Cmd, boolean, WriteErr, Bus>>()
  })

  it('Should_TupleTheResponses_When_Zipping', () => {
    const zipped = pipe(
      Sandwich.named('cell.surface')(read).decide(decideOverRaw).write(writeOutcome),
      Cell.zip(twinCell),
    )
    expect(zipped).type.toBe<Cell.Cell<Cmd, readonly [void, boolean], WriteErr, Bus>>()
  })

  it('Should_WrapTheInnerResponse_When_GateAdmitsTheReaderValue', () => {
    const gated = pipe(optionReader, Cell.gate(innerOverRaw))
    expect(gated).type.toBe<Cell.Cell<Cmd, Option<Decision>, ReadErr | WriteErr, Db | Bus>>()
    expect(gated.run(command)).type.toBe<Effect<Option<Decision>, ReadErr | WriteErr, Db | Bus>>()
  })

  it('Should_ReadTheSameCell_When_GateIsCalledDataFirst', () => {
    expect(Cell.gate(optionReader, innerOverRaw)).type.toBe<
      Cell.Cell<Cmd, Option<Decision>, ReadErr | WriteErr, Db | Bus>
    >()
  })

  it('Should_RefuseTheInner_When_ItsInputIsNotTheReaderValue', () => {
    expect<typeof Cell.gate>().type.not.toBeCallableWith(optionReaderOverLengths, innerOverRaw)
  })

  it('Should_RefuseAReader_When_ItCarriesNoOption', () => {
    expect<typeof Cell.gate>().type.not.toBeCallableWith(bareReader, innerOverRaw)
  })

  it('Should_RefuseAnAdapter_When_GateTakesOnlyTwoCells', () => {
    expect<typeof Cell.gate>().type.not.toBeCallableWith(optionReader, innerOverRaw, (raw: Raw) => raw)
  })

  it('Should_NameTheCollectionInput_When_CollectingOverItems', () => {
    const fold = (responses: readonly Decision[]): number => responses.length
    const folded = Cell.collect(itemCell, fold)
    expect(folded).type.toBe<Cell.Cell<readonly Cmd[], number, ReadErr, Db>>()
    expect(folded.run([command])).type.toBe<Effect<number, ReadErr, Db>>()
  })

  it('Should_BindTheFoldFirst_When_CollectingDataLast', () => {
    const folded = pipe(itemCell, Cell.collect((responses: readonly Decision[]): number => responses.length))
    expect(folded).type.toBe<Cell.Cell<readonly Cmd[], number, ReadErr, Db>>()
  })

  it('Should_RefuseAMutableFold_When_TheFoldReceivesReadonlyResponses', () => {
    expect<typeof Cell.collect>().type.not.toBeCallableWith(itemCell, (responses: Decision[]) => responses.length)
  })

  it('Should_HandEveryResultToTheFold_When_Accumulating', () => {
    const fold = (results: readonly Result.Result<Decision, ReadErr>[]): number => results.length
    const accumulated = Cell.collectAll(itemCell, fold)
    expect(accumulated).type.toBe<Cell.Cell<readonly Cmd[], number, never, Db>>()
    expect(accumulated.run([command])).type.toBe<Effect<number, never, Db>>()
  })

  it('Should_NotInheritTheItemErrorChannel_When_TheConsumerEffectWrapsTheCell', () => {
    const fold = (results: readonly Result.Result<Decision, ReadErr>[]): number => results.length
    const consumed = map(Cell.collectAll(itemCell, fold).run([command]), (count) => count + 1)
    expect(consumed).type.toBe<Effect<number, never, Db>>()
  })

  it('Should_RefuseASuccessOnlyFold_When_TheAccumulateFormCarriesRefusals', () => {
    expect<typeof Cell.collectAll>().type.not.toBeCallableWith(
      itemCell,
      (responses: readonly Decision[]) => responses.length,
    )
  })

  it('Should_RefuseAnAdapter_When_CollectTakesOnlyACellAndAFold', () => {
    expect<typeof Cell.collect>().type.not.toBeCallableWith(
      itemCell,
      (responses: readonly Decision[]) => responses.length,
      innerOverRaw,
    )
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

  it('Should_KeepTheVariance_When_PipeableIsPresent', () => {
    expect<Cell.Cell<Cmd, boolean, never, never>>().type.toBeAssignableTo<
      Cell.Cell<{ id: string }, boolean | void, never, never> & Pipeable
    >()
    expect<Cell.Cell<Cmd, void, WriteErr, never>>().type.toBeAssignableTo<
      Cell.Cell<{ id: string }, void, WriteErr | ReadErr, never> & Pipeable
    >()
  })

  it('Should_PipeThePipedResult_When_NestingInstancePipes', () => {
    const cell = Sandwich.named('cell.surface')(read).decide(decideOverRaw).write(writeOutcome)
    const piped = cell.pipe(Cell.map((_response: void): number => 1))
    expect(piped).type.toBe<Cell.Cell<Cmd, number, never, never>>()
    expect(piped.pipe(Cell.map((count: number): string => `${count}`))).type.toBe<
      Cell.Cell<Cmd, string, never, never>
    >()
  })

  it('Should_GateTheBrand_When_UnbrandedValueIsExpected', () => {
    expect<{ readonly run: (input: Cmd) => Effect<void, never, never> }>().type.not.toBeAssignableTo<
      Cell.Cell<Cmd, void, never, never>
    >()
  })
})

describe('the record API the surface retired', () => {
  it('Should_ExposeNoLayer_When_TheChainIsTheOnlyConstructor', () => {
    expect<typeof Cell>().type.not.toBeAssignableTo<{ readonly layer: Top }>()
  })

  it('Should_ExposeNoBagMachinery_When_TheAssemblerWentInternal', () => {
    type HasApply = 'apply' extends keyof typeof Cell ? true : false
    type HasPhases = 'Phases' extends keyof typeof Cell ? true : false
    type HasWriteDone = 'WriteDone' extends keyof typeof Cell ? true : false
    type HasDescription = 'Description' extends keyof typeof Cell ? true : false
    type HasCanonical = 'canonical' extends keyof typeof Cell ? true : false
    type HasCanonicalCommand = 'CanonicalCommand' extends keyof typeof Cell ? true : false
    type HasPhaseFact = 'PhaseFact' extends keyof typeof Cell ? true : false
    type HasApplier = 'applier' extends keyof typeof Cell ? true : false
    expect<HasApply>().type.toBe<false>()
    expect<HasPhases>().type.toBe<false>()
    expect<HasWriteDone>().type.toBe<false>()
    expect<HasDescription>().type.toBe<false>()
    expect<HasCanonical>().type.toBe<false>()
    expect<HasCanonicalCommand>().type.toBe<false>()
    expect<HasPhaseFact>().type.toBe<false>()
    expect<HasApplier>().type.toBe<false>()
  })
})

describe('the constructors the decide slot accepts', () => {
  it('Should_AcceptTheTotalDecider_When_ItsErrorChannelIsNever', () => {
    const cell = Sandwich.named('cell.surface')(readTagged).decide(totalAdmitTaggedCommand).write(writeTotalOutcome)
    expect(cell).type.toBe<
      Cell.Cell<Cmd, void, never, never> & { readonly phases: readonly ['read', 'decide', 'write'] }
    >()
  })

  it('Should_AcceptTheComposite_When_ItsErrorChannelIsTheComponentUnion', () => {
    const cell = Sandwich.named('cell.surface')(readTagged).decide(chainAdmitTaggedCommands).write(writeChainedOutcome)
    expect(cell).type.toBe<
      Cell.Cell<Cmd, void, never, never> & { readonly phases: readonly ['read', 'decide', 'write'] }
    >()
  })

  it('Should_RefuseAHandRolledChain_When_NoConstructorAppliedTheBrand', () => {
    const taggedChain = Sandwich.named('cell.surface')(readTagged)
    expect<typeof taggedChain.decide>().type.not.toBeCallableWith(decideUnbrandedChain)
  })
})

describe('the sandwich chain the continuation surface builds', () => {
  it('Should_RefuseTheWrite_When_ReadIsFollowedByWrite', () => {
    const lawful = Sandwich.named('cell.surface')(read).decide(decideOverRaw).write(writeOutcome)
    expect(lawful).type.toBe<
      Cell.Cell<Cmd, void, never, never> & { readonly phases: readonly ['read', 'decide', 'write'] }
    >()
    expect(Sandwich.named('cell.surface')(read)).type.not.toBeAssignableTo<{ readonly write: Top }>()
  })

  it('Should_RefuseTheWrite_When_DecideOnADecodedChainSkipsEncode', () => {
    const lawful = Sandwich.named('cell.surface')(read).decode(Sandwich.pure(decode)).decide(decideOverDecoded).encode(
      Sandwich.pure(encodeResult),
    ).write(writeOutput)
    expect(lawful).type.toBe<
      Cell.Cell<Cmd, void, DecodeErr, never> & {
        readonly phases: readonly ['read', 'decode', 'decide', 'encode', 'write']
      }
    >()
    Sandwich.named('cell.surface')(read).decode(Sandwich.pure(decode)).decide(decideOverDecoded).encode(
      Sandwich.pure(encodeResult),
    )
    // write is not lawful before encode on a decoded chain
    expect(Sandwich.named('cell.surface')(read).decode(Sandwich.pure(decode)).decide(decideOverDecoded)).type.not
      .toBeAssignableTo<{
        readonly write: Top
      }>()
  })

  it('Should_PinTheRawGrainPhases_When_WritingAfterDecide', () => {
    const cell = Sandwich.named('cell.surface')(read).decide(decideOverRaw).write(writeOutcome)
    expect(cell).type.toBe<
      Cell.Cell<Cmd, void, never, never> & { readonly phases: readonly ['read', 'decide', 'write'] }
    >()
    expect(cell.phases).type.toBe<readonly ['read', 'decide', 'write']>()
  })

  it('Should_PinTheDecodedGrainPhases_When_WritingAfterEncode', () => {
    const cell = Sandwich.named('cell.surface')(read).decode(Sandwich.pure(decode)).decide(decideOverDecoded).encode(
      Sandwich.pure(encodeResult),
    ).write(writeOutput)
    expect(cell).type.toBe<
      Cell.Cell<Cmd, void, DecodeErr, never> & {
        readonly phases: readonly ['read', 'decode', 'decide', 'encode', 'write']
      }
    >()
    expect(cell.phases).type.toBe<readonly ['read', 'decode', 'decide', 'encode', 'write']>()
  })

  it('Should_UnionTheChannels_When_FivePhasesEachContribute', () => {
    const cell = Sandwich.named('cell.surface')(readNeedingDbAndClock).decode(Sandwich.pure(decode)).decide(
      decideOverDecoded,
    ).encode(
      Sandwich.pure(encodeResult),
    ).write(writeOutputNeedingBus)
    expect(cell).type.toBe<
      Cell.Cell<Cmd, void, DecodeErr, Db | Clock | Bus> & {
        readonly phases: readonly ['read', 'decode', 'decide', 'encode', 'write']
      }
    >()
  })

  it('Should_RefuseABareClosure_When_DecodeDemandsAPurePhase', () => {
    const lawful = Sandwich.named('cell.surface')(read).decode(Sandwich.pure(decode))
    expect(lawful).type.toBe<Sandwich.DecodedChain<Cmd, Raw, Decoded, never, DecodeErr, never>>()
    const readChain = Sandwich.named('cell.surface')(read)
    expect<typeof readChain.decode>().type.not.toBeCallableWith((raw: Raw) => succeedDecoded(raw))
  })

  it('Should_RefuseABareClosure_When_EncodeDemandsAPurePhase', () => {
    const chain = Sandwich.named('cell.surface')(read).decode(Sandwich.pure(decode)).decide(decideOverDecoded)
    expect<typeof chain.encode>().type.not.toBeCallableWith(
      (outcome: Result.Result<Decision, Refusal>) => outcome.pipe(encode, Result.succeed),
    )
  })

  it('Should_RefuseTheEncode_When_ItsRefusalChannelIsNotNever', () => {
    const chain = Sandwich.named('cell.surface')(read).decode(Sandwich.pure(decode)).decide(decideOverDecoded)
    expect<typeof chain.encode>().type.not.toBeCallableWith(
      Sandwich.pure((outcome: Result.Result<Decision, Refusal>): Result.Result<Output, Refusal> =>
        outcome.pipe(encode, Result.succeed)
      ),
    )
  })
})

describe('the constructor arrows', () => {
  it('Should_LiftTheConstant_When_Succeeding', () => {
    expect(Cell.succeed(7)).type.toBe<TopCell<number>>()
    expect(Cell.succeed(7).run(command)).type.toBe<Effect<number, never, never>>()
  })

  it('Should_LiftTheFailure_When_Failing', () => {
    expect(Cell.fail(readErr)).type.toBe<TopCell<never, ReadErr>>()
  })

  it('Should_CarryTheChannels_When_LiftingAnEffect', () => {
    expect(Cell.fromEffect(lifted)).type.toBe<TopCell<string, ReadErr, Db>>()
  })

  it('Should_DeferConstruction_When_Suspending', () => {
    expect(Cell.suspend(() => itemCell)).type.toBe<Cell.Cell<Cmd, Decision, ReadErr, Db>>()
  })

  it('Should_EchoTheInput_When_Id', () => {
    expect(Cell.id<Cmd>()).type.toBe<Cell.Cell<Cmd, Cmd, never, never>>()
    expect(Cell.id<Cmd>().run(command)).type.toBe<Effect<Cmd, never, never>>()
  })

  it('Should_AcceptAnyInput_When_SupplyingAConstant', () => {
    expect(Cell.succeed(7)).type.toBe<TopCell<number>>()
    expect<TopCell<number>>().type.toBeAssignableTo<Cell.Cell<Cmd, number, never, never>>()
  })

  it('Should_AcceptAnyInput_When_LiftingAnEffect', () => {
    expect(Cell.fromEffect(succeedSeven)).type.toBe<TopCell<number>>()
    expect<TopCell<number>>().type.toBeAssignableTo<Cell.Cell<Cmd, number, never, never>>()
  })
})

describe('the error-channel arrows', () => {
  it('Should_RemapTheFailure_When_MappingTheError', () => {
    const remapped = pipe(itemCell, Cell.mapError((_error: ReadErr): string => 'offline'))
    expect(remapped).type.toBe<Cell.Cell<Cmd, Decision, string, Db>>()
    expect(remapped.run(command)).type.toBe<Effect<Decision, string, Db>>()
  })

  it('Should_ReadTheSameCell_When_MappingTheErrorDataFirst', () => {
    expect(Cell.mapError(itemCell, (_error: ReadErr): string => 'offline')).type.toBe<
      Cell.Cell<Cmd, Decision, string, Db>
    >()
  })

  it('Should_NarrowToTheFallbackError_When_Recovering', () => {
    const recovered = pipe(itemCell, Cell.orElse(itemFallback))
    expect(recovered).type.toBe<Cell.Cell<Cmd, Decision, WriteErr, Db | Bus>>()
  })

  it('Should_ReadTheSameCell_When_RecoveringDataFirst', () => {
    expect(Cell.orElse(itemCell, itemFallback)).type.toBe<Cell.Cell<Cmd, Decision, WriteErr, Db | Bus>>()
  })

  it('Should_RefuseAFallback_When_ItsInputIsNotTheCommand', () => {
    expect<typeof Cell.orElse>().type.not.toBeCallableWith(itemCell, innerOverRaw)
  })

  it('Should_UnionTheChannels_When_Observing', () => {
    const observed = pipe(
      itemCell,
      Cell.tap(() => lifted),
    )
    expect(observed).type.toBe<Cell.Cell<Cmd, Decision, ReadErr, Db>>()
  })

  it('Should_ReadTheSameCell_When_ObservingDataFirst', () => {
    expect(Cell.tap(itemCell, () => lifted)).type.toBe<Cell.Cell<Cmd, Decision, ReadErr, Db>>()
  })

  it('Should_UnionTheObserverServices_When_TheObserverNeedsMore', () => {
    const observed = pipe(itemCell, Cell.tap(observeOnBus))
    expect(observed).type.toBe<Cell.Cell<Cmd, Decision, ReadErr, Db | Bus>>()
  })
})

describe('the sequencing arrows and the match destructor', () => {
  it('Should_ThreadTheSameInput_When_FlatMapping', () => {
    const flatMapped = pipe(
      itemCell,
      Cell.flatMap((_decision: Decision): Cell.Cell<Cmd, number, WriteErr, Bus> => numberCell),
    )
    expect(flatMapped).type.toBe<Cell.Cell<Cmd, number, ReadErr | WriteErr, Db | Bus>>()
  })

  it('Should_ReadTheSameCell_When_FlatMappingDataFirst', () => {
    expect(
      Cell.flatMap(itemCell, (_decision: Decision): Cell.Cell<Cmd, number, WriteErr, Bus> => numberCell),
    ).type.toBe<Cell.Cell<Cmd, number, ReadErr | WriteErr, Db | Bus>>()
  })

  it('Should_RefuseTheInner_When_FlatMapDemandsADifferentInput', () => {
    expect<typeof Cell.flatMap>().type.not.toBeCallableWith(itemCell, (_decision: Decision) => innerOverRaw)
  })

  it('Should_CombineOverOneInput_When_ZippingWith', () => {
    const combined = pipe(
      itemCell,
      Cell.zipWith(itemFallback, (_first: Decision, _second: Decision): string => 'paired'),
    )
    expect(combined).type.toBe<Cell.Cell<Cmd, string, ReadErr | WriteErr, Db | Bus>>()
    expect(combined.run(command)).type.toBe<Effect<string, ReadErr | WriteErr, Db | Bus>>()
  })

  it('Should_ReadTheSameCells_When_ZippingWithDataFirst', () => {
    expect(
      Cell.zipWith(itemCell, itemFallback, (_first: Decision, _second: Decision): string => 'paired'),
    ).type.toBe<Cell.Cell<Cmd, string, ReadErr | WriteErr, Db | Bus>>()
  })

  it('Should_RefuseTheOther_When_ZipWithDemandsADifferentInput', () => {
    expect<typeof Cell.zipWith>().type.not.toBeCallableWith(
      itemCell,
      innerOverRaw,
      (_first: Decision, _second: Decision): string => 'paired',
    )
  })

  it('Should_FeedTheResponse_When_AndThenTakesAFunction', () => {
    const dynamic = pipe(
      itemCell,
      Cell.andThen((_decision: Decision): Cell.Cell<Decision, number, WriteErr, Bus> => decisionCell),
    )
    expect(dynamic).type.toBe<Cell.Cell<Cmd, number, ReadErr | WriteErr, Db | Bus>>()
  })

  it('Should_ReadTheSameCell_When_AndThenTakesAFunctionDataFirst', () => {
    expect(
      Cell.andThen(itemCell, (_decision: Decision): Cell.Cell<Decision, number, WriteErr, Bus> => decisionCell),
    ).type.toBe<Cell.Cell<Cmd, number, ReadErr | WriteErr, Db | Bus>>()
  })

  it('Should_RefuseTheBuiltCell_When_ItsInputIsNotTheResponse', () => {
    expect<typeof Cell.andThen>().type.not.toBeCallableWith(itemCell, (_decision: Decision) => innerOverRaw)
  })

  it('Should_FoldTheOutcome_When_Matching', () => {
    const folded = pipe(
      itemCell,
      Cell.match({
        onFailure: (_error: ReadErr): string => 'down',
        onSuccess: (_decision: Decision): number => 1,
      }),
    )
    expect(folded).type.toBe<Cell.Cell<Cmd, string | number, never, Db>>()
    expect(folded.run(command)).type.toBe<Effect<string | number, never, Db>>()
  })

  it('Should_ReadTheSameCell_When_MatchingDataFirst', () => {
    expect(
      Cell.match(itemCell, {
        onFailure: (_error: ReadErr): string => 'down',
        onSuccess: (_decision: Decision): number => 1,
      }),
    ).type.toBe<Cell.Cell<Cmd, string | number, never, Db>>()
  })

  it('Should_ComposeFurther_When_MatchedCellZips', () => {
    const folded = pipe(
      itemCell,
      Cell.match({
        onFailure: (_error: ReadErr): string => 'down',
        onSuccess: (_decision: Decision): number => 1,
      }),
    )
    const paired = pipe(folded, Cell.zip(itemFallback))
    expect(paired).type.toBe<Cell.Cell<Cmd, readonly [string | number, Decision], WriteErr, Db | Bus>>()
  })
})

describe('the Do chain over the TypeLambda', () => {
  it('Should_TypeDoAsContravariantInputUnknown_When_Initialized', () => {
    expect(Cell.Do).type.toBe<TopCell<{}>>()
  })

  it('Should_AccumulateTheRecord_When_BindingOntoDo', () => {
    const chained = pipe(
      Cell.Do,
      Cell.bind('decision', (): Cell.Cell<Cmd, Decision, ReadErr, Db> => itemCell),
      Cell.bind('count', (): Cell.Cell<Cmd, number, WriteErr, Bus> => numberCell),
      Cell.let('line', ({ count }: { readonly count: number }): string => `seen:${count}`),
    )
    expect(chained).type.toBe<
      Cell.Cell<
        Cmd,
        Record<'decision', Decision> & Record<'count', number> & Record<'line', string>,
        ReadErr | WriteErr,
        Db | Bus
      >
    >()
  })

  it('Should_NarrowTheInput_When_BindingDirectlyOntoDo', () => {
    const narrowed = pipe(
      Cell.Do,
      Cell.bind('decision', (): Cell.Cell<Cmd, Decision, ReadErr, Db> => itemCell),
    )
    expect(narrowed).type.toBe<Cell.Cell<Cmd, Record<'decision', Decision>, ReadErr, Db>>()
  })

  it('Should_RefuseTheInner_When_BindDemandsADifferentInput', () => {
    expect<typeof Cell.bind>().type.not.toBeCallableWith(
      itemCell,
      'raw',
      (_scope: { readonly decision: Decision }) => innerOverRaw,
    )
  })

  it('Should_WrapTheValue_When_BindingToAName', () => {
    expect(Cell.bindTo(itemCell, 'v')).type.toBe<
      Cell.Cell<Cmd, Record<'v', Decision>, ReadErr, Db>
    >()
  })

  it('Should_AccumulateTheRecord_When_BindingOntoABindTo', () => {
    const chained = Cell.bind(
      Cell.bindTo(itemCell, 'v'),
      'w',
      (): Cell.Cell<Cmd, number, WriteErr, Bus> => numberCell,
    )
    expect(chained).type.toBe<
      Cell.Cell<Cmd, Record<'v', Decision> & Record<'w', number>, ReadErr | WriteErr, Db | Bus>
    >()
  })

  it('Should_ThreadTheScope_When_LettingAPureField', () => {
    const chained = pipe(
      Cell.Do,
      Cell.bind('decision', (): Cell.Cell<Cmd, Decision, ReadErr, Db> => itemCell),
      Cell.let('admitted', ({ decision }: { readonly decision: Decision }): boolean => decision.admitted),
    )
    expect(chained).type.toBe<
      Cell.Cell<Cmd, Record<'decision', Decision> & Record<'admitted', boolean>, ReadErr, Db>
    >()
  })
})
