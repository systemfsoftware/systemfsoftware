import { Cell } from '@systemfsoftware/effect-cell-types'
import { And, Gherkin, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Result from 'effect/Result'
import { expect } from 'vitest'
import {
  Admitted,
  decide as decideFixture,
  type Decoded,
  type Refused,
} from './__fixtures__/InterpreterDecide.workflow.js'
import { tracedDecide as tracedDecideFixture } from './__fixtures__/InterpreterTracedDecide.workflow.js'

const Feature = makeFeature({ it, layer })

interface Command {
  readonly id: string
}
interface Raw {
  readonly bytes: string
}
interface Output {
  readonly line: string
}
interface Malformed {
  readonly kind: 'Malformed'
  readonly bytes: string
}

/**
 * The write's destination, as a port. A claim that a write did *not* run is only
 * checkable against something that records the writes that did, and a recording port keeps
 * that observation on the output rather than on interaction history.
 */
class Ledger extends Context.Service<Ledger, {
  readonly append: (line: string) => Effect.Effect<void>
  readonly lines: Effect.Effect<readonly string[]>
}>()('Ledger') {}

type LedgerService = Ledger['Service']

/**
 * `append` suspends before it records. A real ledger is asynchronous, and without a
 * suspension point the phases are indistinguishable from concurrent ones: a fully
 * synchronous phase never yields its fiber, so an unbounded fold happens to interleave in
 * order anyway and the ordering scenario cannot fail on a bug it should catch.
 */
const LedgerRecording = Layer.sync(Ledger, () => {
  const written: string[] = []
  return {
    append: (line) => Effect.map(Effect.yieldNow, () => void written.push(line)),
    lines: Effect.sync(() => [...written]),
  }
})

interface Bag extends Cell.Phases {
  readonly command: Command
  readonly raw: Raw
  readonly decoded: Decoded
  readonly decision: Admitted
  readonly decisionError: Refused
  readonly output: Output
  readonly response: string
  readonly decodeError: Malformed
  readonly readError: Malformed
  readonly writeError: never
}

const read: Cell.ReadPhase<Bag> = (command) => Effect.succeed({ bytes: command.id })

const decode: Cell.DecodePhase<Bag> = (raw) =>
  raw.bytes === 'bad'
    ? Result.fail({ kind: 'Malformed', bytes: raw.bytes })
    : Result.succeed({ length: raw.bytes.length })

const decide: Cell.DecidePhase<Bag> = decideFixture

const encode: Cell.EncodePhase<Bag> = (outcome) => ({
  line: Result.match(outcome, {
    onFailure: (refused) => `refused:${refused.why}`,
    onSuccess: (admitted) => `admitted:${admitted.length}`,
  }),
})

const makeWrite = (ledger: LedgerService): Cell.WritePhase<Bag> => (output) =>
  ledger.append(output.line).pipe(Effect.as(output.line))

const makeDescription = (ledger: LedgerService) =>
  Cell.write(
    Cell.encode(Cell.decide(Cell.decode(Cell.read<Bag>(read), decode), decide), encode),
    makeWrite(ledger),
  )

/**
 * The same sandwich authored as a layer spec. Decode and encode are omitted, so the
 * defaults are the identities: the read returns the decision's input directly, and the
 * write's first argument is the decide outcome itself rather than an encoded output.
 */
const makeSpecDescription = (ledger: LedgerService) =>
  Cell.layer({
    read: (command: Command) => Effect.succeed({ length: command.id.length }),
    decide: decideFixture,
    write: (outcome) =>
      Result.match(outcome, {
        onFailure: (refused) => ledger.append(`refused:${refused.why}`).pipe(Effect.as(`refused:${refused.why}`)),
        onSuccess: (admitted) =>
          ledger.append(`admitted:${admitted.length}`).pipe(Effect.as(`admitted:${admitted.length}`)),
      }),
  })

/**
 * A write that reports on the description's read as well as on the encoded output. The raw
 * arrives as the write's second argument, which is the whole point of the argument: an
 * author whose write persists or reports what the read gathered needs no `let` beside the
 * description to carry it, and so needs no runtime guard for a value the fold already has.
 */
const makeWriteRecordingRaw = (ledger: LedgerService): Cell.WritePhase<Bag> => (output, raw) =>
  ledger.append(`${output.line}<-${raw.bytes}`).pipe(Effect.as(output.line))

const makeDescriptionReportingItsRaw = (ledger: LedgerService) =>
  Cell.write(
    Cell.encode(Cell.decide(Cell.decode(Cell.read<Bag>(read), decode), decide), encode),
    makeWriteRecordingRaw(ledger),
  )

/** Stub ledger for vocabulary folds — the fold never runs the effects. */
const stubLedger: LedgerService = {
  append: () => Effect.void,
  lines: Effect.succeed([] as readonly string[]),
}
const oneDescription = makeDescription(stubLedger)

/**
 * The vocabulary fold a consumer performs on the description value alone: phase names,
 * kinds, declared order, the module name, and the I/O-cell classification all come
 * off the value — nothing is re-declared here except the expected assertions.
 */
const axesOf = (description: Cell.WriteDone<Bag>) => {
  const phaseNames: string[] = []
  const phaseKinds: Record<string, 'pure' | 'impure'> = {}
  const declaredOrder = description.phases.map((phase) => {
    phaseKinds[phase.name] = phase.kind
    return phase.name
  })
  for (const name of declaredOrder) {
    if (!phaseNames.includes(name)) phaseNames.push(name)
  }
  return { module: description.module, ioCells: description.ioCells, phaseNames, phaseKinds, declaredOrder }
}

Feature('Applying a phase description')
  .withScenarioLayer(LedgerRecording)
  .body(({ scenario }) => {
    scenario(
      'A refused decision is written as the outcome rather than raised as a failure',
      Gherkin.Do.pipe(
        When('a description is applied to a command its decision refuses')(
          'exit',
          () => Effect.flatMap(Ledger, (ledger) => Effect.exit(Cell.apply(makeDescription(ledger), { id: 'abc' }))),
        ),
        Then('the run succeeds and its response carries the refusal')((s) => {
          expect(s.exit).toStrictEqual(Exit.succeed('refused:too short'))
        }),
        And('the refusal reached the write')(() =>
          Effect.flatMap(Ledger, (ledger) =>
            Effect.map(ledger.lines, (lines) => {
              expect(lines).toEqual(['refused:too short'])
            }))
        ),
      ),
    )

    scenario(
      'A spec-built description answers what the chain-built one answers',
      Gherkin.Do.pipe(
        When('a description built from a layer spec is applied to a command its decision admits')(
          'exit',
          () =>
            Effect.flatMap(Ledger, (ledger) => Effect.exit(Cell.apply(makeSpecDescription(ledger), { id: 'abcd' }))),
        ),
        Then('the run succeeds with the response the chain-built description returns')((s) => {
          expect(s.exit).toStrictEqual(Exit.succeed('admitted:4'))
        }),
        And('the write recorded the decide outcome it received')(() =>
          Effect.flatMap(Ledger, (ledger) =>
            Effect.map(ledger.lines, (lines) => {
              expect(lines).toEqual(['admitted:4'])
            }))
        ),
      ),
    )

    scenario(
      'An admitted decision is written as the outcome',
      Gherkin.Do.pipe(
        When('a description is applied to a command its decision admits')(
          'exit',
          () => Effect.flatMap(Ledger, (ledger) => Effect.exit(Cell.apply(makeDescription(ledger), { id: 'abcd' }))),
        ),
        Then('the run succeeds and its response carries the decision')((s) => {
          expect(s.exit).toStrictEqual(Exit.succeed('admitted:4'))
        }),
      ),
    )

    scenario(
      "A write receives the raw the description's read gathered",
      Gherkin.Do.pipe(
        When('a description whose write reports its raw is applied')(
          'exit',
          () =>
            Effect.flatMap(
              Ledger,
              (ledger) => Effect.exit(Cell.apply(makeDescriptionReportingItsRaw(ledger), { id: 'abcd' })),
            ),
        ),
        Then('the run succeeds with the response the write returned')((s) => {
          expect(s.exit).toStrictEqual(Exit.succeed('admitted:4'))
        }),
        And('the write recorded the encoded output together with the raw')(() =>
          Effect.flatMap(Ledger, (ledger) =>
            Effect.map(ledger.lines, (lines) => {
              expect(lines).toEqual(['admitted:4<-abcd'])
            }))
        ),
      ),
    )

    scenario(
      'A malformed reading fails the run before anything is written',
      Gherkin.Do.pipe(
        When('a description is applied to a command its validation rejects')(
          'exit',
          () => Effect.flatMap(Ledger, (ledger) => Effect.exit(Cell.apply(makeDescription(ledger), { id: 'bad' }))),
        ),
        Then('the run fails with the malformed report')((s) => {
          expect(s.exit).toStrictEqual(Exit.fail({ kind: 'Malformed', bytes: 'bad' }))
        }),
        And('nothing was written')(() =>
          Effect.flatMap(Ledger, (ledger) =>
            Effect.map(ledger.lines, (lines) => {
              expect(lines).toEqual([])
            }))
        ),
      ),
    )

    scenario(
      'A description runs its phases in the order the value declares',
      Gherkin.Do.pipe(
        When('a description declaring the phases out of canonical order is applied')(
          'outcome',
          () => {
            const trace: string[] = []
            // The declared order is what is under test, so each traced phase ignores
            // its input: out of canonical order, a phase receives whatever the fold
            // threaded, which is not its usual input type.
            const tracedRead: Cell.ReadPhase<Bag> = () =>
              Effect.sync(() => {
                trace.push('read')
                return { bytes: 'traced' }
              })
            const tracedDecode: Cell.DecodePhase<Bag> = () => {
              trace.push('decode')
              return Result.succeed({ length: 0 })
            }
            const tracedDecide: Cell.DecidePhase<Bag> = tracedDecideFixture(trace, new Admitted({ length: 0 }))
            const tracedEncode: Cell.EncodePhase<Bag> = () => {
              trace.push('encode')
              return { line: 'declared' }
            }
            const tracedWrite: Cell.WritePhase<Bag> = (output) =>
              Effect.sync(() => {
                trace.push('write')
                return output.line
              })

            // Hand-built description value: the phases array is the execution order, so
            // this declared order — decode before read, decide before decode — is what
            // the interpreter must run. The name-keyed form the interpreter replaced
            // had no order to read, so it would have run the canonical sequence instead.
            const declared: Cell.WriteDone<Bag> = {
              'call write(output) before applying the description': true,
              module: Cell.DESCRIPTION_MODULE,
              ioCells: Cell.IO_CELLS,
              phases: [
                { name: 'decode', kind: 'pure', convention: 'either-fail', run: tracedDecode },
                { name: 'read', kind: 'impure', convention: 'effect', run: tracedRead },
                { name: 'decide', kind: 'pure', convention: 'either-pass', run: tracedDecide },
                { name: 'encode', kind: 'pure', convention: 'total', run: tracedEncode },
                { name: 'write', kind: 'impure', convention: 'effect', run: tracedWrite },
              ],
            }
            return Cell.apply(declared, { id: 'abc' }).pipe(
              Effect.exit,
              Effect.map((exit) => ({ exit, trace })),
            )
          },
        ),
        Then('the phases ran exactly in the declared order')((s) => {
          expect(s.outcome.trace).toEqual(['decode', 'read', 'decide', 'encode', 'write'])
          expect(s.outcome.exit).toStrictEqual(Exit.succeed('declared'))
        }),
      ),
    )

    scenario(
      'The description value carries the whole vocabulary',
      Gherkin.Do.pipe(
        When('the description is folded')(
          'axes',
          () => Effect.succeed(axesOf(oneDescription)),
        ),
        Then('every axis is read from the value')((s) => {
          expect(s.axes.module).toBe(Cell.DESCRIPTION_MODULE)
          // Identity, not a second copy of the literals: this fails if the fold rebuilds the
          // classification instead of carrying the one the constructors wrote. The values
          // themselves are stated once, at the `IO_CELLS` declaration in the description module.
          expect(s.axes.ioCells).toBe(Cell.IO_CELLS)
          expect(s.axes.phaseNames).toEqual(['read', 'decode', 'decide', 'encode', 'write'])
          expect(s.axes.phaseKinds).toEqual({
            read: 'impure',
            decode: 'pure',
            decide: 'pure',
            encode: 'pure',
            write: 'impure',
          })
          expect(s.axes.declaredOrder).toEqual(['read', 'decode', 'decide', 'encode', 'write'])
        }),
      ),
    )

    /**
     * `Cell.vocabulary` is folded off a canonical description at module load, and three
     * packages outside this one now read their phase names, purity and order from it. The
     * expected vocabulary is written out here so the derivation has something to disagree
     * with: this fails if the canonical description stops covering a phase, if the fold
     * drops one, or if someone replaces the fold with a literal that then drifts.
     */
    scenario(
      'The exported vocabulary is the one the constructors build',
      Gherkin.Do.pipe(
        When('the derived vocabulary is read')(
          'derived',
          () => Effect.succeed(Cell.vocabulary),
        ),
        Then('it states every phase, its purity and its invocation shape, in order')((s) => {
          expect(s.derived.phases).toEqual([
            { name: 'read', kind: 'impure', convention: 'effect' },
            { name: 'decode', kind: 'pure', convention: 'either-fail' },
            { name: 'decide', kind: 'pure', convention: 'either-pass' },
            { name: 'encode', kind: 'pure', convention: 'total' },
            { name: 'write', kind: 'impure', convention: 'effect' },
          ])
          expect(s.derived.module).toBe(Cell.DESCRIPTION_MODULE)
          expect(s.derived.ioCells).toBe(Cell.IO_CELLS)
        }),
      ),
    )
  })
