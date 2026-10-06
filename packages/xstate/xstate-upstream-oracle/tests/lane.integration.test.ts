import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { laneReport, type LaneReportOutput } from '@systemfsoftware/xstate-upstream-oracle'
import { Effect, Layer } from 'effect'

import fixture from './__fixtures__/report.absent-case.json' with { type: 'json' }

const Feature = makeFeature({ it })

/** The key the fixture report's second file registers: the disposition below holds only the first. */
const ABSENT_KEY = 'test/b.test.ts > suite b > unlisted :: 0'

/** The disposition the fixture report is judged against: its first case held, its second absent (R4). */
const dispositionText = (): string =>
  `${
    JSON.stringify({
      version: 1,
      held: [{ _tag: 'HeldCase', key: 'test/a.test.ts > suite a > holds :: 0', mode: 'passed' }],
      retired: [],
      parity: [],
    })
  }\n`

const judgeFixture = (): LaneReportOutput =>
  laneReport({
    reportText: JSON.stringify(fixture),
    dispositionText: dispositionText(),
    dispositionPath: 'disposition.json',
    write: false,
  })

Feature('The oracle lane holds upstream cases against a ruled disposition')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A fixture report case absent from the disposition is refused and named',
      Gherkin.Do.pipe(
        Given('a fixture report whose second case the disposition does not hold')(
          'outcome',
          () => Effect.succeed(judgeFixture()),
        ),
        Then('the lane exits refused and names the unlisted key')((s, expect) =>
          expect(s.outcome).toSatisfy(
            (outcome) => outcome.exitCode === 1 && outcome.stderr.includes(ABSENT_KEY),
            'a refusal that names the unlisted key',
          )
        ),
      ),
    )
  })
