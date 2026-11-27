import { alchemyStack, fileStage } from '@systemfsoftware/alchemy-stack-layer'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Layer } from 'effect'
import * as Digest from 'effect/crypto/Digest'
import { probeStack } from './__fixtures__/probe-stack.fixture.js'
import { freshLedger, outcomeOf, releasedExit } from './__fixtures__/stack-outcome.fixture.js'

const Feature = makeFeature({ it })

Feature('naming the stage a stack deploys under')
  .live("deploys run on the engine's own fibers and the real clock")
  .withLayer(Layer.empty)
  .withScenarioLayer(Digest.layerWebCrypto)
  .body(({ scenario, scenarioOutline }) => {
    scenarioOutline(
      'a test file at <file> in the project rooted at <root> under base stage <base> deploys under <expected>',
      [
        {
          file: 'tests/sign-in.integration.test.ts',
          root: 'app',
          project: undefined,
          base: 'ci_7',
          expected: 'ci_7_471af455',
        },
        {
          file: 'tests/billing.integration.test.ts',
          root: 'app',
          project: undefined,
          base: 'ci_7',
          expected: 'ci_7_696a8ed7',
        },
        {
          file: 'tests/sign-in.integration.test.ts',
          root: 'web',
          project: undefined,
          base: 'ci_7',
          expected: 'ci_7_5077e7e9',
        },
        {
          file: 'tests/sign-in.integration.test.ts',
          root: 'app',
          project: 'unit',
          base: 'ci_7',
          expected: 'ci_7_9dba1dc8',
        },
        {
          file: 'tests/sign-in.integration.test.ts',
          root: 'app',
          project: undefined,
          base: 'test_dev',
          expected: 'test_dev_471af455',
        },
      ],
      (row) =>
        Gherkin.Do.pipe(
          When('the stage is named for that file')('stage', () =>
            fileStage({
              baseStage: row.base,
              testFile: { name: row.file, projectName: row.project, rootName: row.root },
            })),
          Then(
            'it is the base stage and 8 hex digits of the SHA-256 of the project name, root directory name and file path',
          )((s, expect) => expect(s.stage).toBe(row.expected)),
        ),
    )

    scenario(
      'a configured stage is used as given',
      Gherkin.Do.pipe(
        Given('a ledger')('ledger', () => freshLedger()),
        When('a stack configured with a stage is deployed and released')('exit', (s) =>
          releasedExit(
            alchemyStack('Named', {
              stage: 'naming_given',
              deploy: probeStack({ ledger: s.ledger, stackName: 'Named' }),
            }).layer,
          )),
        Then('the provider saw that stage on create and on delete')((s, expect) =>
          expect({ outcome: outcomeOf(s.exit), stages: s.ledger.entries.map((entry) => entry.stage) }).toEqual({
            outcome: { tag: 'success' },
            stages: ['naming_given', 'naming_given'],
          })
        ),
      ),
    )
  })
