import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

import { runWorkerFamilyCommand, workerFamilyLayer } from './__fixtures__/worker-family.js'
import { WorkerFamilyCommand, workerFamilyModel } from './__fixtures__/worker-family.model.js'

const Feature = makeFeature({ it })

const SEQUENCES = 100
const OPERATIONS = 8

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
        Then('every reading answers exactly how many workers are running')((s, expect) =>
          expect(s.report).toMatchObject({ _tag: 'Pass', histories: SEQUENCES })
        ),
      ),
    )
  })
