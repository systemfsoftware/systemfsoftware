import { Cell, Workflow } from '@systemfsoftware/effect-cell-types'
import type { Effect } from 'effect/Effect'
import * as EffectModule from 'effect/Effect'
import { pipe } from 'effect/Function'
import type { Layer } from 'effect/Layer'
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
declare const readNeedingDbAndClock: (command: Cmd) => Effect<Raw, never, Db | Clock>
declare const readNeedingClock: (command: Cmd) => Effect<Raw, never, Clock>
declare const decode: (raw: Raw) => Result<Decoded, DecodeErr>
declare const decideOverRaw: Workflow.Workflow<Raw, Decision, Refusal>
declare const decideOverDecoded: Workflow.Workflow<Decoded, Decision, Refusal>
declare const decideUnbranded: (decoded: Raw) => Result<Decision, Refusal>
declare const encode: (outcome: Result<Decision, Refusal>) => Output

// The short-form write receives the decide outcome; the long-form write receives whatever
// the encode produced. Two fixture families keep the two forms honest.
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

describe('the sandwich the layer builds', () => {
  it('Should_InferTheCell_When_ShortSpecSuppliesReadDecideWrite', () => {
    const cell = Cell.layer({ read, decide: decideOverRaw, write: writeOutcome })
    expect(cell).type.toBe<Cell.Cell<Cmd, void, never, never>>()
  })

  it('Should_InferTheCell_When_LongSpecSuppliesAllFivePhases', () => {
    const cell = Cell.layer({ read, decode, decide: decideOverDecoded, encode, write: writeOutput })
    expect(cell).type.toBe<Cell.Cell<Cmd, void, DecodeErr, never>>()
  })

  it('Should_UnionTheErrorChannel_When_ReadAndWriteCanFail', () => {
    const cell = Cell.layer({ read: readFailing, decide: decideOverRaw, write: writeOutcomeFailing })
    expect(cell).type.toBe<Cell.Cell<Cmd, void, ReadErr | WriteErr, never>>()
  })

  it('Should_PublishTheReadServices_When_TheReadRequiresAService', () => {
    const cell = Cell.layer({ read: readNeedingDb, decide: decideOverRaw, write: writeOutcome })
    expect(cell).type.toBe<Cell.Cell<Cmd, void, never, Db>>()
  })

  it('Should_UnionTheServices_When_BothImpurePhasesRequire', () => {
    const cell = Cell.layer({ read: readNeedingDb, decide: decideOverRaw, write: writeOutcomeNeedingBus })
    expect(cell).type.toBe<Cell.Cell<Cmd, void, never, Db | Bus>>()
  })

  it('Should_KeepTheDecideRefusalAnOutcome_When_NamingTheErrorChannel', () => {
    // The decide refusal is the value the write receives, so Refusal appears in no
    // error channel — only the read and write errors do.
    const cell = Cell.layer({ read: readFailing, decide: decideOverRaw, write: writeOutcomeFailing })
    expect(cell).type.not.toBeAssignableTo<Cell.Cell<Cmd, void, Refusal, never>>()
  })
})

describe('the refusals the layer keeps', () => {
  it('Should_NameTheMissingEncode_When_DecodeArrivesWithoutEncode', () => {
    expect<typeof Cell.layer>().type.not.toBeCallableWith({
      read,
      decode,
      decide: decideOverDecoded,
      write: writeOutput,
    })
  })

  it('Should_NameTheMissingDecode_When_EncodeArrivesWithoutDecode', () => {
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
    expect<typeof Cell.layer>().type.not.toBeCallableWith({ read, decide: decideOverRaw, write: writeOutcomeWrongRaw })
  })

  it('Should_RefuseTheDecide_When_ItsInputIsNotTheReadRaw', () => {
    expect<typeof Cell.layer>().type.not.toBeCallableWith({ read, decide: decideOverDecoded, write: writeOutcome })
  })

  it('Should_AdmitAUnaryWrite_When_TheWriteIgnoresTheOutcome', () => {
    const cell = Cell.layer({ read, decide: decideOverRaw, write: writeOutcomeUnary })
    expect(cell).type.toBe<Cell.Cell<Cmd, void, never, never>>()
  })

  it('Should_AcceptTheLongSpec_When_AllFivePhasesArrive', () => {
    expect<typeof Cell.layer>().type.toBeCallableWith({
      read,
      decode,
      decide: decideOverDecoded,
      encode,
      write: writeOutput,
    })
  })

  it('Should_AcceptTheShortSpec_When_ThreePhasesArrive', () => {
    expect<typeof Cell.layer>().type.toBeCallableWith({ read, decide: decideOverRaw, write: writeOutcome })
  })
})

describe('the run the Cell publishes', () => {
  it('Should_RunTheCell_When_CalledDataFirst', () => {
    const cell = Cell.layer({ read, decide: decideOverRaw, write: writeOutcome })
    expect(Cell.run(cell, command)).type.toBe<Effect<void, never, never>>()
  })

  it('Should_RunTheCell_When_TheInputIsBoundFirst', () => {
    const cell = Cell.layer({ read, decide: decideOverRaw, write: writeOutcome })
    const withInput = Cell.run(command)
    expect(withInput(cell)).type.toBe<Effect<void, never, never>>()
  })

  it('Should_HideTheNeverServices_When_TheCellNeedsNone', () => {
    expect<Cell.Run<Cmd, void, never, never>>().type.toBe<(input: Cmd) => Effect<void, never>>()
  })

  it('Should_HandTheRunToTheShell_When_TheCellIsProvided', () => {
    const cell = Cell.layer({ read, decide: decideOverRaw, write: writeOutcome })
    const capability: (input: Cmd) => Effect<void, never> = cell.run
    expect(capability).type.toBe<(input: Cmd) => Effect<void, never>>()
  })

  it('Should_KeepTheServicesVisible_When_TheCellNeedsThem', () => {
    expect<Cell.Cell<Cmd, void, never, Db>>().type.not.toBeAssignableTo<(input: Cmd) => Effect<void, never>>()
  })
})

describe('the provide that clears the services', () => {
  it('Should_NarrowRToNever_When_TheOneServiceIsProvided', () => {
    const cell = Cell.layer({ read: readNeedingDb, decide: decideOverRaw, write: writeOutcome })
    const provided = pipe(cell, Cell.provide(dbLayer))
    expect(provided).type.toBe<Cell.Cell<Cmd, void, never, never>>()
    expect(Cell.run(provided, command)).type.toBe<Effect<void, never, never>>()
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
    const twice = pipe(once, Cell.provide(clockLayer))
    expect(twice).type.toBe<Cell.Cell<Cmd, void, never, never>>()
  })

  it('Should_DemandTheProvide_When_TheShellRunsTheCell', () => {
    const cell = Cell.layer({ read: readNeedingDb, decide: decideOverRaw, write: writeOutcome })
    const runInShell = EffectModule.provide(Cell.run(cell, command), dbLayer)
    expect(runInShell).type.toBe<Effect<void, never, never>>()
  })
})

describe('the combinators', () => {
  it('Should_TransformTheResponse_When_Mapping', () => {
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

  it('Should_PreserveEveryChannel_When_PolicyWraps', () => {
    const policy = <A, E, R>(self: Effect<A, E, R>): Effect<A, E, R> => self
    const wrapped = pipe(Cell.layer({ read, decide: decideOverRaw, write: writeOutcome }), Cell.withPolicy(policy))
    expect(wrapped).type.toBe<Cell.Cell<Cmd, void, never, never>>()
  })
})

describe('the variance the Cell carries', () => {
  it('Should_AcceptTheWiderCommandCell_When_TheNarrowerIsExpected', () => {
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

describe('the vocabulary table', () => {
  it('Should_CarryTheComposerAndPureFacts_When_ReadingTheVocabulary', () => {
    expect<Cell.Vocabulary['composer']>().type.toBe<'layer'>()
    expect<Cell.Vocabulary['byKind']>().type.toBe<{ readonly pure: readonly Cell.PhaseName[] }>()
  })

  it('Should_HaveNoCanonicalOrWalk_When_TheTableBecameAConst', () => {
    type HasCanonical = 'canonical' extends keyof typeof Cell ? true : false
    type HasCanonicalCommand = 'CanonicalCommand' extends keyof typeof Cell ? true : false
    type HasPhaseFact = 'PhaseFact' extends keyof typeof Cell ? true : false
    expect<HasCanonical>().type.toBe<false>()
    expect<HasCanonicalCommand>().type.toBe<false>()
    expect<HasPhaseFact>().type.toBe<false>()
  })

  it('Should_HaveNoApplier_When_TheApplyEntryWasDeleted', () => {
    type HasApplier = 'applier' extends keyof Cell.Vocabulary ? true : false
    expect<HasApplier>().type.toBe<false>()
  })

  it('Should_ExposeNoBagMachinery_When_TheAssemblerWentInternal', () => {
    type HasApply = 'apply' extends keyof typeof Cell ? true : false
    type HasPhases = 'Phases' extends keyof typeof Cell ? true : false
    type HasWriteDone = 'WriteDone' extends keyof typeof Cell ? true : false
    type HasDescription = 'Description' extends keyof typeof Cell ? true : false
    type HasLayers = 'layers' extends keyof Cell.Vocabulary ? true : false
    type HasPhasesField = 'phases' extends keyof Cell.Vocabulary ? true : false
    expect<HasApply>().type.toBe<false>()
    expect<HasPhases>().type.toBe<false>()
    expect<HasWriteDone>().type.toBe<false>()
    expect<HasDescription>().type.toBe<false>()
    expect<HasLayers>().type.toBe<false>()
    expect<HasPhasesField>().type.toBe<false>()
  })
})
