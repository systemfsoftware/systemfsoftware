import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Match } from 'effect'

import { CheckRejected } from './__fixtures__/ConformanceRejected.schema.js'
import { familyLayer, runSupervisionRestartCommand } from './__fixtures__/supervision-restart.js'
import { supervisionRestart, SupervisionRestartCommand } from './__fixtures__/supervision-restart.model.js'

const Feature = makeFeature({ it })

const SEQUENCES = 60
const OPERATIONS = 6

const judgedRounds = <C, R>(report: Conformance.Report<C, R>): number =>
  Match.value(report).pipe(
    Match.tag('Pass', (pass) => pass.histories),
    Match.orElse(() => {
      throw new CheckRejected({ report: Conformance.render(report) })
    }),
  )

Feature('Restarting only the member of a family that died')
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A family that restarts only the failed member keeps every other member in place',
      Gherkin.Do.pipe(
        Given('a family that restarts only the member that died')(
          'subject',
          () => Effect.succeed(familyLayer('one_for_one')),
        ),
        When('sixty sequences of a member dying run against it')(
          'report',
          (s) =>
            Conformance.sequential(s.subject, {
              commands: SupervisionRestartCommand,
              model: supervisionRestart.oneForOneModel,
              run: runSupervisionRestartCommand,
              sequences: SEQUENCES,
              operations: OPERATIONS,
              seed: 13,
            }),
        ),
        Then('every reading answers exactly which members were restarted')((s) => {
          const judged = judgedRounds(s.report)
          if (judged !== SEQUENCES) {
            throw new CheckRejected({ report: `${judged} rounds were judged, not ${SEQUENCES}` })
          }
        }),
      ),
    )
  })
