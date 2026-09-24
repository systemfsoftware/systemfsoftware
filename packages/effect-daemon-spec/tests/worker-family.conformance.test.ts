import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Match } from 'effect'

import { CheckRejected } from './__fixtures__/ConformanceRejected.schema.js'
import { runWorkerFamilyCommand, workerFamilyLayer } from './__fixtures__/worker-family.js'
import { WorkerFamilyCommand, workerFamilyModel } from './__fixtures__/worker-family.model.js'

const Feature = makeFeature({ it })

const SEQUENCES = 100
const OPERATIONS = 8

const judgedRounds = <C, R>(report: Conformance.Report<C, R>): number =>
  Match.value(report).pipe(
    Match.tag('Pass', (pass) => pass.histories),
    Match.orElse(() => {
      throw new CheckRejected({ report: Conformance.render(report) })
    }),
  )

Feature('Starting and stopping a family of workers')
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'Workers started and stopped in any order keep the tally in step with the workers that are running',
      Gherkin.Do.pipe(
        Given('a family that holds each worker until it is stopped')(
          'subject',
          () => Effect.succeed(workerFamilyLayer),
        ),
        When('a hundred sequences of starting, stopping, and reading the tally run against it')(
          'report',
          (s) =>
            Conformance.sequential(s.subject, {
              commands: WorkerFamilyCommand,
              model: workerFamilyModel,
              run: runWorkerFamilyCommand,
              sequences: SEQUENCES,
              operations: OPERATIONS,
              seed: 11,
            }),
        ),
        Then('every reading answers exactly how many workers are running')((s) => {
          const judged = judgedRounds(s.report)
          if (judged !== SEQUENCES) {
            throw new CheckRejected({ report: `${judged} rounds were judged, not ${SEQUENCES}` })
          }
        }),
      ),
    )
  })
