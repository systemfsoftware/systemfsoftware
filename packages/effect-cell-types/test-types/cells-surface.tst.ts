import { Cell, Encode, Workflow } from '@systemfsoftware/effect-cell-types'
import { pipe } from 'effect'
import type { Effect } from 'effect/Effect'
import type { Layer } from 'effect/Layer'
import type { Option } from 'effect/Option'
import type { Result } from 'effect/Result'
import { describe, expect, it } from 'tstyche'

import { chainAdmitTaggedCommands } from '../tests/__fixtures__/chain-admit-tagged-commands.workflow.js'
import { CommandRefused, TaggedCmd } from '../tests/__fixtures__/Command.schema.js'
import { type Decision as TotalDecision, DecisionError } from '../tests/__fixtures__/Decision.schema.js'
import { totalAdmitTaggedCommand } from '../tests/__fixtures__/total-admit-tagged-command.workflow.js'

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
declare const decode: (raw: Raw) => Result<Decoded, DecodeErr>
declare const decideOverRaw: Workflow.Workflow<Raw, Decision, Refusal>
declare const decideOverDecoded: Workflow.Workflow<Decoded, Decision, Refusal>
declare const decideUnbranded: (decoded: Raw) => Result<Decision, Refusal>
declare const decideUnbrandedChain: (command: TaggedCmd) => Result<TotalDecision, CommandRefused | DecisionError>
declare const encode: (outcome: Result<Decision, Refusal>) => Output
declare const passThroughEncode: (outcome: Result<Decision, Refusal>) => Result<Decision, Refusal>
declare const writeOutcome: (outcome: Result<Decision, Refusal>, raw: Raw) => Effect<void, never, never>
declare const writeOutcomeFailing: (outcome: Result<Decision, Refusal>, raw: Raw) => Effect<void, WriteErr, never>
declare const writeOutcomeUnary: (outcome: Result<Decision, Refusal>) => Effect<void, never, never>
declare const writeOutcomeWrongRaw: (outcome: Result<Decision, Refusal>, raw: Decoded) => Effect<void, never, never>
declare const writeOutcomeNeedingBus: (outcome: Result<Decision, Refusal>, raw: Raw) => Effect<void, never, Bus>
declare const writeOutput: (output: Output, raw: Raw) => Effect<void, never, never>
declare const command: Cmd

declare const dbLayer: Layer<Db, never, never>
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

declare const readTagged: (command: Cmd) => Effect<TaggedCmd, never, never>
declare const writeTotalOutcome: (outcome: Result<TotalDecision, never>, raw: TaggedCmd) => Effect<void, never, never>
declare const writeChainedOutcome: (
  outcome: Result<TotalDecision, CommandRefused | DecisionError>,
  raw: TaggedCmd,
) => Effect<void, never, never>

describe('T1 the sandwich the layer builds', () => {
  it('Should_InferTheCell_When_ShortSpecSuppliesReadDecideWrite', () => {
    const cell = Cell.layer({ read, decide: decideOverRaw, write: writeOutcome })
    expect(cell).type.toBe<Cell.Cell<Cmd, void, never, never>>()
  })

  it('Should_InferTheCell_When_LongSpecSuppliesAllFivePhases', () => {
    const cell = Cell.layer({ read, decode, decide: decideOverDecoded, encode, write: writeOutput })
    expect(cell).type.toBe<Cell.Cell<Cmd, void, DecodeErr, never>>()
  })

  it('Should_InferTheSameCell_When_EncodeIsTheIdentity', () => {
    const withIdentity = Cell.layer({
      read,
      decode,
      decide: decideOverDecoded,
      encode: Encode.identity,
      write: writeOutcome,
    })
    const withPassThrough = Cell.layer({
      read,
      decode,
      decide: decideOverDecoded,
      encode: passThroughEncode,
      write: writeOutcome,
    })
    expect(withIdentity).type.toBe<Cell.Cell<Cmd, void, DecodeErr, never>>()
    expect(withIdentity).type.toBe<typeof withPassThrough>()
  })

  it('Should_UnionTheErrorChannel_When_ReadAndWriteCanFail', () => {
    const cell = Cell.layer({ read: readFailing, decide: decideOverRaw, write: writeOutcomeFailing })
    expect(cell).type.toBe<Cell.Cell<Cmd, void, ReadErr | WriteErr, never>>()
  })

  it('Should_UnionTheServices_When_BothImpurePhasesRequire', () => {
    const cell = Cell.layer({ read: readNeedingDb, decide: decideOverRaw, write: writeOutcomeNeedingBus })
    expect(cell).type.toBe<Cell.Cell<Cmd, void, never, Db | Bus>>()
  })
})

describe('T2 the refusal the error channel excludes', () => {
  it('Should_KeepTheDecideRefusalAnOutcome_When_NamingTheErrorChannel', () => {
    const cell = Cell.layer({ read: readFailing, decide: decideOverRaw, write: writeOutcomeFailing })
    expect(cell).type.not.toBeAssignableTo<Cell.Cell<Cmd, void, Refusal, never>>()
  })
})

describe('T3 the specs the layer refuses', () => {
  it('Should_RefuseTheSpec_When_DecodeArrivesWithoutEncode', () => {
    expect<typeof Cell.layer>().type.not.toBeCallableWith({
      read,
      decode,
      decide: decideOverDecoded,
      write: writeOutput,
    })
  })

  it('Should_RefuseTheSpec_When_EncodeArrivesWithoutDecode', () => {
    expect<typeof Cell.layer>().type.not.toBeCallableWith({
      read,
      decide: decideOverDecoded,
      encode,
      write: writeOutput,
    })
  })

  it('Should_RefuseTheSpec_When_TheDecideIsNotAWorkflow', () => {
    expect<typeof Cell.layer>().type.not.toBeCallableWith({ read, decide: decideUnbranded, write: writeOutcome })
  })

  it('Should_RefuseTheSpec_When_TheWriteSecondParameterIsNotTheRaw', () => {
    expect<typeof Cell.layer>().type.not.toBeCallableWith({
      read,
      decide: decideOverRaw,
      write: writeOutcomeWrongRaw,
    })
  })

  it('Should_RefuseTheDecide_When_ItsInputIsNotTheReadRaw', () => {
    expect<typeof Cell.layer>().type.not.toBeCallableWith({ read, decide: decideOverDecoded, write: writeOutcome })
  })
})

describe('T4 the unary write the layer admits', () => {
  it('Should_AdmitAUnaryWrite_When_TheWriteIgnoresTheOutcome', () => {
    const cell = Cell.layer({ read, decide: decideOverRaw, write: writeOutcomeUnary })
    expect(cell).type.toBe<Cell.Cell<Cmd, void, never, never>>()
  })
})

describe('T5 the run the Cell publishes', () => {
  it('Should_YieldTheChannels_When_TheArrowIsApplied', () => {
    const cell = Cell.layer({ read, decide: decideOverRaw, write: writeOutcome })
    expect(cell.run(command)).type.toBe<Effect<void, never, never>>()
  })

  it('Should_HideTheNeverServices_When_TheCellNeedsNone', () => {
    expect<Cell.Run<Cmd, void, never, never>>().type.toBe<(input: Cmd) => Effect<void, never>>()
  })

  it('Should_KeepTheServicesVisible_When_TheCellNeedsThem', () => {
    expect<Cell.Cell<Cmd, void, never, Db>>().type.not.toBeAssignableTo<(input: Cmd) => Effect<void, never>>()
  })
})

describe('T6 the provide that clears the services', () => {
  it('Should_NarrowRToNever_When_TheOneServiceIsProvided', () => {
    const cell = Cell.layer({ read: readNeedingDb, decide: decideOverRaw, write: writeOutcome })
    const provided = pipe(cell, Cell.provide(dbLayer))
    expect(provided).type.toBe<Cell.Cell<Cmd, void, never, never>>()
    expect(provided.run(command)).type.toBe<Effect<void, never, never>>()
  })

  it('Should_UnionTheLayerError_When_TheLayerCanFail', () => {
    const cell = Cell.layer({ read: readNeedingDb, decide: decideOverRaw, write: writeOutcome })
    const provided = pipe(cell, Cell.provide(failingDbLayer))
    expect(provided).type.toBe<Cell.Cell<Cmd, void, ReadErr, never>>()
  })

  it('Should_KeepTheLayerInputs_When_TheLayerNeedsServices', () => {
    const cell = Cell.layer({ read: readNeedingClock, decide: decideOverRaw, write: writeOutcome })
    const provided = pipe(cell, Cell.provide(dbFromClock))
    expect(provided).type.toBe<Cell.Cell<Cmd, void, never, Clock>>()
  })

  it('Should_NarrowOnlyTheProvidedService_When_ChainingProvides', () => {
    const cell = Cell.layer({ read: readNeedingDbAndClock, decide: decideOverRaw, write: writeOutcome })
    const once = pipe(cell, Cell.provide(dbLayer))
    expect(once).type.toBe<Cell.Cell<Cmd, void, never, Clock>>()
    expect(pipe(once, Cell.provide(clockLayer))).type.toBe<Cell.Cell<Cmd, void, never, never>>()
  })
})

describe('T7 the combinator algebra', () => {
  it('Should_PreserveEveryChannel_When_MappingTheResponse', () => {
    const mapped = pipe(outputCell, Cell.map((verdict: boolean): number => (verdict ? 1 : 0)))
    expect(mapped).type.toBe<Cell.Cell<Output, number, WriteErr, Bus>>()
  })

  it('Should_TransformTheInput_When_MappingInput', () => {
    const remapped = pipe(outputCell, Cell.mapInput((s: string) => ({ line: s })))
    expect(remapped).type.toBe<Cell.Cell<string, boolean, WriteErr, Bus>>()
  })

  it('Should_FeedTheResponseToTheNext_When_AndThenChains', () => {
    const chained = pipe(Cell.layer({ read, decide: decideOverRaw, write: writeOutcome }), Cell.andThen(voidCell))
    expect(chained).type.toBe<Cell.Cell<Cmd, boolean, WriteErr, Bus>>()
  })

  it('Should_TupleTheResponses_When_Zipping', () => {
    const zipped = pipe(Cell.layer({ read, decide: decideOverRaw, write: writeOutcome }), Cell.zip(twinCell))
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
    const fold = (results: readonly Result<Decision, ReadErr>[]): number => results.length
    const accumulated = Cell.collectAll(itemCell, fold)
    expect(accumulated).type.toBe<Cell.Cell<readonly Cmd[], number, ReadErr, Db>>()
    expect(accumulated.run([command])).type.toBe<Effect<number, ReadErr, Db>>()
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

describe('T8 the variance the Cell carries', () => {
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
})

describe('T9 the vocabulary table and the names it lost', () => {
  it('Should_CarryTheComposerAndPureFacts_When_ReadingTheVocabulary', () => {
    expect<Cell.Vocabulary['composer']>().type.toBe<'layer'>()
    expect<Cell.Vocabulary['byKind']>().type.toBe<{ readonly pure: readonly Cell.PhaseName[] }>()
  })

  it('Should_ExposeNoBagMachinery_When_TheAssemblerWentInternal', () => {
    type HasApply = 'apply' extends keyof typeof Cell ? true : false
    type HasPhases = 'Phases' extends keyof typeof Cell ? true : false
    type HasWriteDone = 'WriteDone' extends keyof typeof Cell ? true : false
    type HasDescription = 'Description' extends keyof typeof Cell ? true : false
    type HasCanonical = 'canonical' extends keyof typeof Cell ? true : false
    type HasCanonicalCommand = 'CanonicalCommand' extends keyof typeof Cell ? true : false
    type HasPhaseFact = 'PhaseFact' extends keyof typeof Cell ? true : false
    type HasLayers = 'layers' extends keyof Cell.Vocabulary ? true : false
    type HasPhasesField = 'phases' extends keyof Cell.Vocabulary ? true : false
    type HasApplier = 'applier' extends keyof Cell.Vocabulary ? true : false
    expect<HasApply>().type.toBe<false>()
    expect<HasPhases>().type.toBe<false>()
    expect<HasWriteDone>().type.toBe<false>()
    expect<HasDescription>().type.toBe<false>()
    expect<HasCanonical>().type.toBe<false>()
    expect<HasCanonicalCommand>().type.toBe<false>()
    expect<HasPhaseFact>().type.toBe<false>()
    expect<HasLayers>().type.toBe<false>()
    expect<HasPhasesField>().type.toBe<false>()
    expect<HasApplier>().type.toBe<false>()
  })
})

describe('T10 the constructors the decide slot accepts', () => {
  it('Should_AcceptTheTotalDecider_When_ItsErrorChannelIsNever', () => {
    const cell = Cell.layer({ read: readTagged, decide: totalAdmitTaggedCommand, write: writeTotalOutcome })
    expect(cell).type.toBe<Cell.Cell<Cmd, void, never, never>>()
  })

  it('Should_AcceptTheComposite_When_ItsErrorChannelIsTheComponentUnion', () => {
    const cell = Cell.layer({ read: readTagged, decide: chainAdmitTaggedCommands, write: writeChainedOutcome })
    expect(cell).type.toBe<Cell.Cell<Cmd, void, never, never>>()
  })

  it('Should_RefuseAHandRolledChain_When_NoConstructorAppliedTheBrand', () => {
    expect<typeof Cell.layer>().type.not.toBeCallableWith({
      read: readTagged,
      decide: decideUnbrandedChain,
      write: writeChainedOutcome,
    })
  })
})
