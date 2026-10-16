import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
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
        Then('the submission is admitted with its length noted and the door keeps it on record')((s, expect) =>
          Effect.flatMap(
            Ledger,
            (ledger) =>
              Effect.map(
                ledger.lines,
                (lines) =>
                  expect({ outcome: s.outcome, lines }).toEqual({ outcome: 'admitted:4', lines: ['admitted:4'] }),
              ),
          )
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
        Then(
          'the submission is refused for being too short and its slip is a plain written slip with no private markings',
        )((s, expect) =>
          Effect.flatMap(
            Ledger,
            (ledger) =>
              Effect.map(ledger.lines, (lines) =>
                expect({ outcome: s.outcome, lines }).toEqual({
                  outcome: 'refused:too short',
                  lines: ['refused:{"_tag":"Rejected","why":"too short"}:plain:true'],
                })),
          )
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
        Then(
          'the door turns the submission away, keeps exactly one turned-away slip, and records the run as a refusal',
        )((s, expect) =>
          Effect.flatMap(
            Ledger,
            (ledger) =>
              Effect.flatMap(refusalSnapshotsOf('cell.admission.damaged'), (refusals) =>
                Effect.map(ledger.lines, (lines) =>
                  expect({
                    outcome: s.outcome,
                    lineCount: lines.length,
                    firstLine: lines[0],
                    refusalCount: refusals.length,
                    snapshotType: refusals[0]?.type,
                    firstRefusalState: refusals[0]?.state,
                  }).toEqual({
                    outcome: Exit.succeed('turned away'),
                    lineCount: 1,
                    firstLine: expect.stringMatching(/^turned away:/),
                    refusalCount: 1,
                    snapshotType: 'Histogram',
                    firstRefusalState: expect.objectContaining({ count: 1 }),
                  }))),
          )
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
        Then(
          'the door answers that the submission is unreadable, keeps it on record, and records the run as a refusal',
        )((s, expect) =>
          Effect.flatMap(
            Ledger,
            (ledger) =>
              Effect.flatMap(refusalSnapshotsOf('cell.admission.negative'), (refusals) =>
                Effect.map(ledger.lines, (lines) =>
                  expect({
                    outcome: s.outcome,
                    lines,
                    refusalCount: refusals.length,
                    firstRefusalState: refusals[0]?.state,
                  }).toEqual({
                    outcome: Exit.succeed('unreadable'),
                    lines: ['unreadable:-3'],
                    refusalCount: 1,
                    firstRefusalState: expect.objectContaining({ count: 1 }),
                  }))),
          )
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
          Then('the door keeps exactly that record')((_, expect) =>
            Effect.flatMap(Ledger, (ledger) => Effect.map(ledger.lines, (lines) => expect(lines).toEqual([row.record])))
          ),
        ),
    )
  })
