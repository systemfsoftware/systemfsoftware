import { Cell } from '@systemfsoftware/effect-cell-types'
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Either from 'effect/Either'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
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
class Ledger extends Context.Tag('Ledger')<Ledger, {
  readonly append: (line: string) => Effect.Effect<void>
  readonly lines: Effect.Effect<ReadonlyArray<string>>
}>() {}

/**
 * `append` suspends before it records. A real ledger is asynchronous, and without a
 * suspension point the layers are indistinguishable from concurrent ones: a fully
 * synchronous phase never yields its fiber, so an unbounded fold happens to interleave in
 * order anyway and the ordering scenario cannot fail on a bug it should catch.
 */
const LedgerRecording = Layer.sync(Ledger, () => {
  const written: Array<string> = []
  return Ledger.of({
    append: (line) => Effect.map(Effect.yieldNow(), () => void written.push(line)),
    lines: Effect.sync(() => [...written]),
  })
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
    ? Either.left({ kind: 'Malformed', bytes: raw.bytes })
    : Either.right({ length: raw.bytes.length })

const decide: Cell.DecidePhase<Bag> = (decoded) =>
  decoded.length > 3
    ? Either.right({ kind: 'Admitted', length: decoded.length })
    : Either.left({ kind: 'Refused', why: 'too short' })

const encode: Cell.EncodePhase<Bag> = (outcome) => ({
  line: Either.match(outcome, {
    onLeft: (refused) => `refused:${refused.why}`,
    onRight: (admitted) => `admitted:${admitted.length}`,
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
 * A second layer that receives the first layer's response directly rather than observing its
 * write. This is the mechanism a later layer needs when it must know what an earlier layer
 * decided: without it the only route is to re-derive that decision, duplicating it in every
 * layer that follows.
 */
const readsThePreviousResponse: Cell.ReadPhase<Bag> = (_command, previous) =>
  Effect.succeed({ bytes: Option.getOrElse(previous, () => 'none') })

const secondLayerReceivesTheFirst = Cell.write(
  Cell.encode(
    Cell.decide(Cell.decode(Cell.read(readsThePreviousResponse, oneLayer), decode), decide),
    encode,
  ),
  write,
)

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
      "A later layer receives the earlier layer's response",
      Gherkin.Do.pipe(
        Given("a description whose second layer reads the first layer's response")(
          'description',
          () => Effect.succeed(secondLayerReceivesTheFirst),
        ),
        When('it is applied to a command the first layer admits')(
          'exit',
          (s) => Effect.exit(Cell.apply(s.description, { id: 'abcd' })),
        ),
        Then("the second layer decided on the first layer's response")((s) => {
          expect(s.exit).toStrictEqual(Exit.succeed('admitted:10'))
        }),
      ),
    )
  })
