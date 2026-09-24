import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

import { CheckRejected, passedRuns, remoteStoreLayer, runTraceCommand } from './__fixtures__/remote-store.js'
import { TraceCommand, traceStoreModel } from './__fixtures__/trace-store.model.js'

const Feature = makeFeature({ it })

const ROUNDS = 300
const ACTIONS_PER_ROUND = 8

Feature('Keeping observed traces in step with the store that serves them', { timeout: 120_000 })
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'Storing, growing, and clearing traces keeps every reading in step with the store',
      Gherkin.Do.pipe(
        Given('a remote trace store that began holding nothing')(
          'store',
          () => Effect.succeed(remoteStoreLayer),
        ),
        When('three hundred rounds of storing, growing, clearing, and reading traces run against it')(
          'report',
          (s) =>
            Conformance.sequential(s.store, {
              commands: TraceCommand,
              model: traceStoreModel,
              run: runTraceCommand,
              sequences: ROUNDS,
              operations: ACTIONS_PER_ROUND,
            }),
        ),
        Then('every reading answers exactly what the store holds for the trace it was asked about')((s) => {
          const judged = passedRuns(s.report)
          if (judged !== ROUNDS) throw new CheckRejected({ report: `${judged} rounds were judged, not ${ROUNDS}` })
        }),
      ),
    )
  })
