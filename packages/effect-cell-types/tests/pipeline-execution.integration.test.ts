import { expect } from '@effect/vitest'
import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Metric from 'effect/Metric'

import { admitDecodedCommand, Admitted, Malformed, Rejected } from './__fixtures__/admit-decoded-command.workflow.js'

const Feature = makeFeature({ it })

interface Submission {
  readonly id: string
}

class Ledger extends Context.Service<Ledger, {
  readonly lines: Effect.Effect<ReadonlyArray<string>>
  readonly append: (line: string) => Effect.Effect<void>
}>()('Ledger') {}

const LedgerRecording = Layer.provideMerge(
  Layer.sync(Ledger, () => {
    const lines: string[] = []
    return {
      lines: Effect.sync(() => [...lines]),
      append: (line: string) =>
        Effect.sync(() => {
          lines.push(line)
        }),
    }
  }),
  Layer.sync(Metric.MetricRegistry, (): Metric.MetricRegistry => new Map()),
)

const FreshMetricRegistry = Layer.sync(Metric.MetricRegistry, () => new Map())

type AdmittedEncoded = (typeof Admitted)['Encoded']
type RejectedEncoded = (typeof Rejected)['Encoded']
type MalformedEncoded = (typeof Malformed)['Encoded']
type TurnedAwayEncoded = Sandwich.CommandRejected

const answerSubmissions = {
  Admitted: (decision: AdmittedEncoded) =>
    Effect.flatMap(
      Ledger,
      (ledger) => Effect.as(ledger.append(`admitted:${decision.length}`), `admitted:${decision.length}`),
    ),
  Rejected: (decision: RejectedEncoded) =>
    Effect.flatMap(Ledger, (ledger) =>
      Effect.as(
        ledger.append(
          `refused:${JSON.stringify(decision)}:plain:${Object.getPrototypeOf(decision) === Object.prototype}`,
        ),
        `refused:${decision.why}`,
      )),
  Malformed: (refusal: MalformedEncoded) =>
    Effect.flatMap(Ledger, (ledger) => Effect.as(ledger.append(`unreadable:${refusal.length}`), 'unreadable')),
  CommandRejected: (rejected: TurnedAwayEncoded) =>
    Effect.flatMap(Ledger, (ledger) => Effect.as(ledger.append(`turned away:${rejected.issue}`), 'turned away')),
}

const admissionCell = Sandwich.named('cell.admission')((submission: Submission) =>
  Effect.succeed({ length: submission.id.length })
).decide(admitDecodedCommand).write(answerSubmissions)

const damagedMeasurementCell = Sandwich.named('cell.admission.damaged')(() => Effect.succeed({ length: 1.5 }))
  .decide(admitDecodedCommand)
  .write(answerSubmissions)

const negativeMeasurementCell = Sandwich.named('cell.admission.negative', { boundaries: [0.001, 1] })(() =>
  Effect.succeed({ length: -3 })
)
  .decide(admitDecodedCommand)
  .write(answerSubmissions)

const refusalSnapshotsOf = (door: string) =>
  Effect.map(
    Metric.snapshot,
    (snapshots) =>
      snapshots.filter((snapshot) =>
        snapshot.type === 'Histogram' &&
        snapshot.id.includes(`app.${door}.duration`) &&
        snapshot.attributes?.['result_class'] === 'failure'
      ),
  )

Feature('Admitting submissions at the door')
  .withScenarioLayer(Layer.merge(LedgerRecording, FreshMetricRegistry))
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A well-formed submission of good length is admitted and recorded',
      Gherkin.Do.pipe(
        Given('a door that has recorded nothing yet')(
          'door',
          () => Effect.succeed(admissionCell),
        ),
        When('a submission of four letters is checked at the door')(
          'outcome',
          ({ door }) => door.run({ id: 'abcd' }),
        ),
        Then('the submission is admitted with its length noted')((s) => {
          expect(s.outcome).toBe('admitted:4')
        }),
        And('the door keeps the admission on record')(() =>
          Effect.flatMap(Ledger, (ledger) =>
            Effect.map(ledger.lines, (lines) => {
              expect(lines).toEqual(['admitted:4'])
            }))
        ),
      ),
    )

    scenario(
      'A too-short submission is refused, and the refusal arrives as a plain written slip',
      Gherkin.Do.pipe(
        Given('a door that has recorded nothing yet')(
          'door',
          () => Effect.succeed(admissionCell),
        ),
        When('a submission of two letters is checked at the door')(
          'outcome',
          ({ door }) => door.run({ id: 'ab' }),
        ),
        Then('the submission is refused for being too short')((s) => {
          expect(s.outcome).toBe('refused:too short')
        }),
        And('the slip on record is a plain written slip with no private markings')(() =>
          Effect.flatMap(Ledger, (ledger) =>
            Effect.map(ledger.lines, (lines) => {
              expect(lines).toEqual([
                'refused:{"_tag":"Rejected","why":"too short"}:plain:true',
              ])
            }))
        ),
      ),
    )

    scenario(
      'A submission with a damaged measurement is turned away and the run is recorded as a refusal',
      Gherkin.Do.pipe(
        Given('a door whose measurement of every submission is damaged')(
          'door',
          () => Effect.succeed(damagedMeasurementCell),
        ),
        When('a submission with a damaged measurement is checked at the door')(
          'outcome',
          ({ door }) => Effect.exit(door.run({ id: 'abcd' })),
        ),
        Then('the door turns the submission away and records why')((s) => {
          expect(s.outcome).toSatisfy(Exit.isSuccess)
          expect(s.outcome).toStrictEqual(Exit.succeed('turned away'))
        }),
        And('the turned-away submission is on record')(() =>
          Effect.flatMap(Ledger, (ledger) =>
            Effect.map(ledger.lines, (lines) => {
              expect(lines.length).toBe(1)
              expect(lines[0]).toSatisfy((line: string | undefined) =>
                line !== undefined && line.startsWith('turned away:')
              )
            }))
        ),
        And('the run itself is recorded as a refusal, not as a broken run')(() =>
          Effect.map(refusalSnapshotsOf('cell.admission.damaged'), (refusals) => {
            expect(refusals.length).toBe(1)
            const [first] = refusals
            if (first?.type !== 'Histogram') throw new Error('the door records refused runs on its duration histogram')
            expect(first.state.count).toBe(1)
          })
        ),
      ),
    )

    scenario(
      'A submission measured below zero is refused as unreadable and the run is recorded as a refusal',
      Gherkin.Do.pipe(
        Given('a door that reads every submission below zero')(
          'door',
          () => Effect.succeed(negativeMeasurementCell),
        ),
        When('a submission measured at minus three is checked at the door')(
          'outcome',
          ({ door }) => Effect.exit(door.run({ id: 'abcd' })),
        ),
        Then('the door answers that the submission is unreadable')((s) => {
          expect(s.outcome).toStrictEqual(Exit.succeed('unreadable'))
        }),
        And('the unreadable measurement is on record as written')(() =>
          Effect.flatMap(Ledger, (ledger) =>
            Effect.map(ledger.lines, (lines) => {
              expect(lines).toEqual(['unreadable:-3'])
            }))
        ),
        And('the run itself is recorded as a refusal, not as a broken run')(() =>
          Effect.map(refusalSnapshotsOf('cell.admission.negative'), (refusals) => {
            expect(refusals.length).toBe(1)
          })
        ),
      ),
    )

    scenarioOutline(
      'Submissions of every kind leave exactly one record each',
      [
        { id: 'abcd', record: 'admitted:4' },
        { id: 'ab', record: 'refused:{"_tag":"Rejected","why":"too short"}:plain:true' },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('a door that has recorded nothing yet')(
            'door',
            () => Effect.succeed(admissionCell),
          ),
          When('a submission is checked at the door')(
            'outcome',
            ({ door }) => door.run({ id: row.id }),
          ),
          Then('the door keeps exactly that record')(() =>
            Effect.flatMap(Ledger, (ledger) =>
              Effect.map(ledger.lines, (lines) => {
                expect(lines).toEqual([row.record])
              }))
          ),
        ),
    )
  })
