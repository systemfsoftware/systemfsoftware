import { Cell, Workflow } from '@systemfsoftware/effect-cell-types'
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Result from 'effect/Result'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

interface Command {
  readonly id: string
}
interface Raw {
  readonly bytes: string
}
interface Decoded {
  readonly length: number
}
interface Admitted {
  readonly kind: 'Admitted'
  readonly length: number
}
interface Refused {
  readonly kind: 'Refused'
  readonly why: string
  // The decide error channel must satisfy the tagged-channel rule the workflow brand rides
  // on, so it can be handed through `Workflow.make`. The tag is set by the fail literal;
  // the type declaration stays string-wide to keep this fixture out of the manual-tag rule.
  readonly _tag: string
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

/**
 * `append` suspends before it records. A real ledger is asynchronous, and without a
 * suspension point the layers are indistinguishable from concurrent ones: a fully
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
  readonly readContext: Ledger
  readonly writeContext: Ledger
}

const read: Cell.ReadPhase<Bag> = (command) => Effect.succeed({ bytes: command.id })

const decode: Cell.DecodePhase<Bag> = (raw) =>
  raw.bytes === 'bad'
    ? Result.fail({ kind: 'Malformed', bytes: raw.bytes })
    : Result.succeed({ length: raw.bytes.length })

const decide: Cell.DecidePhase<Bag> = Workflow.make(
  (decoded: Decoded): Result.Result<Admitted, Refused> =>
    decoded.length > 3
      ? Result.succeed({ kind: 'Admitted', length: decoded.length })
      : Result.fail({ kind: 'Refused', why: 'too short', _tag: 'Refused' }),
)

const encode: Cell.EncodePhase<Bag> = (outcome) => ({
  line: Result.match(outcome, {
    onFailure: (refused) => `refused:${refused.why}`,
    onSuccess: (admitted) => `admitted:${admitted.length}`,
  }),
})

const write: Cell.WritePhase<Bag> = (output) =>
  Effect.flatMap(Ledger, (ledger) => ledger.append(output.line)).pipe(Effect.as(output.line))

const unreadable: Cell.ReadPhase<Bag> = () => Effect.fail({ kind: 'Malformed', bytes: 'second layer' })

const oneLayer = Cell.write(
  Cell.encode(Cell.decide(Cell.decode(Cell.read<Bag>(read), decode), decide), encode),
  write,
)

const twoLayers = Cell.write(
  Cell.encode(Cell.decide(Cell.decode(Cell.read(unreadable, oneLayer), decode), decide), encode),
  write,
)

/**
 * A second layer that reads back what the first layer wrote. This is the shape a call site
 * whose real order writes before it decides takes, so the ordering it depends on has to be
 * observable: run the layers concurrently and this read sees an empty ledger instead.
 */
const readsWhatWasWritten: Cell.ReadPhase<Bag> = () =>
  Effect.flatMap(Ledger, (ledger) => Effect.map(ledger.lines, (lines) => ({ bytes: lines.join('|') })))

const secondLayerReadsTheFirst = Cell.write(
  Cell.encode(
    Cell.decide(Cell.decode(Cell.read(readsWhatWasWritten, oneLayer), decode), decide),
    encode,
  ),
  write,
)

/**
 * The vocabulary fold a consumer performs on the description value alone: phase names,
 * kinds, intra-layer order, the module name, and the I/O-cell classification all come
 * off the value — nothing is re-declared here except the expected assertions.
 */
const axesOf = (description: Cell.WriteDone<Bag>) => {
  const phaseNames: string[] = []
  const phaseKinds: Record<string, 'pure' | 'impure'> = {}
  const intraLayerOrder = description.layers.map((layer) =>
    layer.phases.map((phase) => {
      phaseKinds[phase.name] = phase.kind
      return phase.name
    })
  )
  for (const names of intraLayerOrder) {
    for (const name of names) {
      if (!phaseNames.includes(name)) phaseNames.push(name)
    }
  }
  return { module: description.module, ioCells: description.ioCells, phaseNames, phaseKinds, intraLayerOrder }
}

Feature('Applying a phase description')
  .withScenarioLayer(LedgerRecording)
  .body(({ scenario }) => {
    scenario(
      'A refused decision is written as the outcome rather than raised as a failure',
      Gherkin.Do.pipe(
        When('a description is applied to a command its decision refuses')(
          'exit',
          () => Effect.exit(Cell.apply(oneLayer, { id: 'abc' })),
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
      'An admitted decision is written as the outcome',
      Gherkin.Do.pipe(
        When('a description is applied to a command its decision admits')(
          'exit',
          () => Effect.exit(Cell.apply(oneLayer, { id: 'abcd' })),
        ),
        Then('the run succeeds and its response carries the decision')((s) => {
          expect(s.exit).toStrictEqual(Exit.succeed('admitted:4'))
        }),
      ),
    )

    scenario(
      'A malformed reading fails the run before anything is written',
      Gherkin.Do.pipe(
        When('a description is applied to a command its validation rejects')(
          'exit',
          () => Effect.exit(Cell.apply(oneLayer, { id: 'bad' })),
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
      "A later layer failing leaves an earlier layer's write in place",
      Gherkin.Do.pipe(
        Given('a description of two layers whose second layer cannot read')(
          'description',
          () => Effect.succeed(twoLayers),
        ),
        When('it is applied to a command the first layer admits')(
          'exit',
          (s) => Effect.exit(Cell.apply(s.description, { id: 'abcd' })),
        ),
        Then("the run fails with the second layer's reading failure")((s) => {
          expect(s.exit).toStrictEqual(Exit.fail({ kind: 'Malformed', bytes: 'second layer' }))
        }),
        And("the first layer's write is still recorded")(() =>
          Effect.flatMap(Ledger, (ledger) =>
            Effect.map(ledger.lines, (lines) => {
              expect(lines).toEqual(['admitted:4'])
            }))
        ),
      ),
    )

    scenario(
      'A later layer reads what an earlier layer wrote',
      Gherkin.Do.pipe(
        Given('a description of two layers whose second layer reads the ledger')(
          'description',
          () => Effect.succeed(secondLayerReadsTheFirst),
        ),
        When('it is applied to a command the first layer admits')(
          'exit',
          (s) => Effect.exit(Cell.apply(s.description, { id: 'abcd' })),
        ),
        Then("the response is derived from the first layer's write")((s) => {
          expect(s.exit).toStrictEqual(Exit.succeed('admitted:10'))
        }),
        And('both layers wrote, in order')(() =>
          Effect.flatMap(Ledger, (ledger) =>
            Effect.map(ledger.lines, (lines) => {
              expect(lines).toEqual(['admitted:4', 'admitted:10'])
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
            const tracedDecide: Cell.DecidePhase<Bag> = Workflow.make(
              (): Result.Result<Admitted, Refused> => {
                trace.push('decide')
                return Result.succeed({ kind: 'Admitted', length: 0 })
              },
            )
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
            // the interpreter must run. The name-keyed layer the interpreter replaced
            // had no order to read, so it would have run the canonical sequence instead.
            const declared: Cell.WriteDone<Bag> = {
              'call write(output) before applying the description': true,
              module: Cell.DESCRIPTION_MODULE,
              ioCells: Cell.IO_CELLS,
              layers: [
                {
                  phases: [
                    { name: 'decode', kind: 'pure', convention: 'either-fail', run: tracedDecode },
                    { name: 'read', kind: 'impure', convention: 'effect', run: tracedRead },
                    { name: 'decide', kind: 'pure', convention: 'either-pass', run: tracedDecide },
                    { name: 'encode', kind: 'pure', convention: 'total', run: tracedEncode },
                    { name: 'write', kind: 'impure', convention: 'effect', run: tracedWrite },
                  ],
                },
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
        When('the one-layer description is folded')(
          'axes',
          () => Effect.succeed(axesOf(oneLayer)),
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
          expect(s.axes.intraLayerOrder).toEqual([['read', 'decode', 'decide', 'encode', 'write']])
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
