import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

import { dynamicChildrenLayer, runDynamicChildrenCommand } from './__fixtures__/dynamic-children.js'
import { DynamicChildrenCommand, dynamicChildrenModel } from './__fixtures__/dynamic-children.model.js'

const Feature = makeFeature({ it })

const SEQUENCES = 100
const OPERATIONS = 8

Feature('Supervising daemons that are started and stopped on demand')
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'Daemons started and stopped in any order keep the running count exact',
      Gherkin.Do.pipe(
        Given('a supervisor that accepts up to a thousand daemons')(
          'subject',
          () => Effect.succeed(dynamicChildrenLayer),
        ),
        When('a hundred sequences of starting daemons, stopping them, and reading the count run against it')(
          'report',
          (s) =>
            Conformance.sequential(s.subject, {
              commands: DynamicChildrenCommand,
              model: dynamicChildrenModel,
              run: runDynamicChildrenCommand,
              sequences: SEQUENCES,
              operations: OPERATIONS,
              seed: 5,
            }),
        ),
        Then('every reading answers exactly how many daemons are running')((s, expect) =>
          expect(s.report).toMatchObject({ _tag: 'Pass', histories: SEQUENCES })
        ),
      ),
    )
  })
