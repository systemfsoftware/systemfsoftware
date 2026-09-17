import { Cell, Sandwich, Workflow } from '@systemfsoftware/effect-cell-types'
import { pipe } from 'effect'
import type { Effect } from 'effect/Effect'
import { map } from 'effect/Effect'
import type { Layer } from 'effect/Layer'
import type { Option } from 'effect/Option'
import * as Result from 'effect/Result'
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
declare const writeTotalOutcome: (
  outcome: Result.Result<TotalDecision, never>,
  raw: TaggedCmd,
) => Effect<void, never, never>
declare const writeChainedOutcome: (
  outcome: Result.Result<TotalDecision, CommandRefused | DecisionError>,
  raw: TaggedCmd,
) => Effect<void, never, never>

describe('T1 the sandwich the chain builds', () => {
  it('Should_InferTheCell_When_ReadDecideWriteChain', () => {
    const cell = Sandwich.read(read).decide(decideOverRaw).write(writeOutcome)
    expect(cell).type.toBe<
      Cell.Cell<Cmd, void, never, never> & { readonly phases: readonly ['read', 'decide', 'write'] }
    >()
  })

  it('Should_InferTheCell_When_AllFivePhasesChain', () => {
    const cell = Sandwich.read(read).decode(Sandwich.pure(decode)).decide(decideOverDecoded).encode(
      Sandwich.pure((outcome) => Result.succeed(encode(outcome))),
    ).write(writeOutput)
    expect(cell).type.toBe<
      Cell.Cell<Cmd, void, DecodeErr, never> & {
        readonly phases: readonly ['read', 'decode', 'decide', 'encode', 'write']
      }
    >()
  })

  it('Should_UnionTheErrorChannel_When_ReadAndWriteCanFail', () => {
    const cell = Sandwich.read(readFailing).decide(decideOverRaw).write(writeOutcomeFailing)
    expect(cell).type.toBe<
      Cell.Cell<Cmd, void, ReadErr | WriteErr, never> & { readonly phases: readonly ['read', 'decide', 'write'] }
    >()
  })

  it('Should_UnionTheServices_When_BothImpurePhasesRequire', () => {
    const cell = Sandwich.read(readNeedingDb).decide(decideOverRaw).write(writeOutcomeNeedingBus)
    expect(cell).type.toBe<
      Cell.Cell<Cmd, void, never, Db | Bus> & { readonly phases: readonly ['read', 'decide', 'write'] }
    >()
  })
})

describe('T2 the refusal the error channel excludes', () => {
  it('Should_KeepTheDecideRefusalAnOutcome_When_NamingTheErrorChannel', () => {
    const cell = Sandwich.read(readFailing).decide(decideOverRaw).write(writeOutcomeFailing)
    expect(cell).type.not.toBeAssignableTo<Cell.Cell<Cmd, void, Refusal, never>>()
  })
})

describe('T3 the chains the surface refuses', () => {
  it('Should_RefuseTheWrite_When_DecodeArrivesWithoutEncode', () => {
    expect(Sandwich.read(read).decode(Sandwich.pure(decode)).decide(decideOverDecoded)).type.not.toBeAssignableTo<{
      readonly write: unknown
    }>()
  })

  it('Should_RefuseTheEncode_When_EncodeArrivesWithoutDecode', () => {
    expect(Sandwich.read(read).decide(decideOverRaw)).type.not.toBeAssignableTo<{ readonly encode: unknown }>()
  })

  it('Should_RefuseTheDecide_When_TheDecideIsNotAWorkflow', () => {
    const rawChain = Sandwich.read(read)
    expect<typeof rawChain.decide>().type.not.toBeCallableWith(decideUnbranded)
  })

  it('Should_RefuseTheWrite_When_TheWriteSecondParameterIsNotTheRaw', () => {
    const decided = Sandwich.read(read).decide(decideOverRaw)
    expect<typeof decided.write>().type.not.toBeCallableWith(writeOutcomeWrongRaw)
  })

  it('Should_RefuseTheDecide_When_ItsInputIsNotTheReadRaw', () => {
    const rawChain = Sandwich.read(read)
    expect<typeof rawChain.decide>().type.not.toBeCallableWith(decideOverDecoded)
  })
})

describe('T4 the unary write the chain admits', () => {
  it('Should_AdmitAUnaryWrite_When_TheWriteIgnoresTheOutcome', () => {
    const cell = Sandwich.read(read).decide(decideOverRaw).write(writeOutcomeUnary)
    expect(cell).type.toBe<
      Cell.Cell<Cmd, void, never, never> & { readonly phases: readonly ['read', 'decide', 'write'] }
    >()
  })
})

describe('T5 the run the Cell publishes', () => {
  it('Should_YieldTheChannels_When_TheArrowIsApplied', () => {
    const cell = Sandwich.read(read).decide(decideOverRaw).write(writeOutcome)
    expect(cell.run(command)).type.toBe<Effect<void, never, never>>()
  })
})

describe('T6 the provide that clears the services', () => {
  it('Should_NarrowRToNever_When_TheOneServiceIsProvided', () => {
    const cell = Sandwich.read(readNeedingDb).decide(decideOverRaw).write(writeOutcome)
    const provided = pipe(cell, Cell.provide(dbLayer))
    expect(provided).type.toBe<Cell.Cell<Cmd, void, never, never>>()
    expect(provided.run(command)).type.toBe<Effect<void, never, never>>()
  })

  it('Should_UnionTheLayerError_When_TheLayerCanFail', () => {
    const cell = Sandwich.read(readNeedingDb).decide(decideOverRaw).write(writeOutcome)
    const provided = pipe(cell, Cell.provide(failingDbLayer))
    expect(provided).type.toBe<Cell.Cell<Cmd, void, ReadErr, never>>()
  })

  it('Should_KeepTheLayerInputs_When_TheLayerNeedsServices', () => {
    const cell = Sandwich.read(readNeedingClock).decide(decideOverRaw).write(writeOutcome)
    const provided = pipe(cell, Cell.provide(dbFromClock))
    expect(provided).type.toBe<Cell.Cell<Cmd, void, never, Clock>>()
  })

  it('Should_NarrowOnlyTheProvidedService_When_ChainingProvides', () => {
    const cell = Sandwich.read(readNeedingDbAndClock).decide(decideOverRaw).write(writeOutcome)
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
    const chained = pipe(Sandwich.read(read).decide(decideOverRaw).write(writeOutcome), Cell.andThen(voidCell))
    expect(chained).type.toBe<Cell.Cell<Cmd, boolean, WriteErr, Bus>>()
  })

  it('Should_TupleTheResponses_When_Zipping', () => {
    const zipped = pipe(Sandwich.read(read).decide(decideOverRaw).write(writeOutcome), Cell.zip(twinCell))
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

describe('T9 the record API the surface retired', () => {
  it('Should_ExposeNoLayer_When_TheChainIsTheOnlyConstructor', () => {
    expect<typeof Cell>().type.not.toBeAssignableTo<{ readonly layer: unknown }>()
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

describe('T10 the constructors the decide slot accepts', () => {
  it('Should_AcceptTheTotalDecider_When_ItsErrorChannelIsNever', () => {
    const cell = Sandwich.read(readTagged).decide(totalAdmitTaggedCommand).write(writeTotalOutcome)
    expect(cell).type.toBe<
      Cell.Cell<Cmd, void, never, never> & { readonly phases: readonly ['read', 'decide', 'write'] }
    >()
  })

  it('Should_AcceptTheComposite_When_ItsErrorChannelIsTheComponentUnion', () => {
    const cell = Sandwich.read(readTagged).decide(chainAdmitTaggedCommands).write(writeChainedOutcome)
    expect(cell).type.toBe<
      Cell.Cell<Cmd, void, never, never> & { readonly phases: readonly ['read', 'decide', 'write'] }
    >()
  })

  it('Should_RefuseAHandRolledChain_When_NoConstructorAppliedTheBrand', () => {
    const taggedChain = Sandwich.read(readTagged)
    expect<typeof taggedChain.decide>().type.not.toBeCallableWith(decideUnbrandedChain)
  })
})

describe('T11 the sandwich chain the continuation surface builds', () => {
  it('Should_RefuseTheWrite_When_ReadIsFollowedByWrite', () => {
    const lawful = Sandwich.read(read).decide(decideOverRaw).write(writeOutcome)
    expect(lawful).type.toBe<
      Cell.Cell<Cmd, void, never, never> & { readonly phases: readonly ['read', 'decide', 'write'] }
    >()
    expect(Sandwich.read(read)).type.not.toBeAssignableTo<{ readonly write: unknown }>()
  })

  it('Should_RefuseTheWrite_When_DecideOnADecodedChainSkipsEncode', () => {
    const lawful = Sandwich.read(read).decode(Sandwich.pure(decode)).decide(decideOverDecoded).encode(
      Sandwich.pure(encodeResult),
    ).write(writeOutput)
    expect(lawful).type.toBe<
      Cell.Cell<Cmd, void, DecodeErr, never> & {
        readonly phases: readonly ['read', 'decode', 'decide', 'encode', 'write']
      }
    >()
    Sandwich.read(read).decode(Sandwich.pure(decode)).decide(decideOverDecoded).encode(Sandwich.pure(encodeResult))
    // write is not lawful before encode on a decoded chain
    expect(Sandwich.read(read).decode(Sandwich.pure(decode)).decide(decideOverDecoded)).type.not.toBeAssignableTo<{
      readonly write: unknown
    }>()
  })

  it('Should_PinTheRawGrainPhases_When_WritingAfterDecide', () => {
    const cell = Sandwich.read(read).decide(decideOverRaw).write(writeOutcome)
    expect(cell).type.toBe<
      Cell.Cell<Cmd, void, never, never> & { readonly phases: readonly ['read', 'decide', 'write'] }
    >()
    expect(cell.phases).type.toBe<readonly ['read', 'decide', 'write']>()
  })

  it('Should_PinTheDecodedGrainPhases_When_WritingAfterEncode', () => {
    const cell = Sandwich.read(read).decode(Sandwich.pure(decode)).decide(decideOverDecoded).encode(
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
    const cell = Sandwich.read(readNeedingDbAndClock).decode(Sandwich.pure(decode)).decide(decideOverDecoded).encode(
      Sandwich.pure(encodeResult),
    ).write(writeOutputNeedingBus)
    expect(cell).type.toBe<
      Cell.Cell<Cmd, void, DecodeErr, Db | Clock | Bus> & {
        readonly phases: readonly ['read', 'decode', 'decide', 'encode', 'write']
      }
    >()
  })

  it('Should_RefuseABareClosure_When_DecodeDemandsAPurePhase', () => {
    const lawful = Sandwich.read(read).decode(Sandwich.pure(decode))
    expect(lawful).type.toBe<Sandwich.DecodedChain<Cmd, Raw, Decoded, never, DecodeErr, never>>()
    const readChain = Sandwich.read(read)
    expect<typeof readChain.decode>().type.not.toBeCallableWith((raw: Raw) => succeedDecoded(raw))
  })

  it('Should_RefuseABareClosure_When_EncodeDemandsAPurePhase', () => {
    const chain = Sandwich.read(read).decode(Sandwich.pure(decode)).decide(decideOverDecoded)
    expect<typeof chain.encode>().type.not.toBeCallableWith(
      (outcome: Result.Result<Decision, Refusal>) => Result.succeed(encode(outcome)),
    )
  })

  it('Should_RefuseTheEncode_When_ItsRefusalChannelIsNotNever', () => {
    const chain = Sandwich.read(read).decode(Sandwich.pure(decode)).decide(decideOverDecoded)
    expect<typeof chain.encode>().type.not.toBeCallableWith(
      Sandwich.pure((outcome: Result.Result<Decision, Refusal>): Result.Result<Output, Refusal> =>
        Result.succeed(encode(outcome))
      ),
    )
  })
})
