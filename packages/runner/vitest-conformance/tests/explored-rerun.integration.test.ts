import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Config, Effect, Option } from 'effect'
import * as Layer from 'effect/Layer'
import { assertionOf, messagesOf, type ProbeRun, runProbes } from './__fixtures__/run-fixtures'

const Feature = makeFeature({ it })

const PROBE = 'spec-runtime/explored-rerun.integration.test.ts'

const NO_CHOICE = 'Explored scenarios and their second run A scenario with no choice point passes'
const CHOICE = 'Explored scenarios and their second run A scenario with a choice point passes'
const LEAK =
  'Explored scenarios and their second run A scenario with no choice point reads a counter that outlives its run'
const SEEDED_LEAK =
  'An explored scenario replaying a recorded seed A scenario with no choice point reads a counter that outlives its run'

const runsOf = (run: ProbeRun, scenario: string): number =>
  run.console.filter((line) => line.content.trim() === `explored-rerun: ${scenario}`).length

const seedsUnder = (profile: Option.Option<string>): number => Option.getOrUndefined(profile) === 'local' ? 25 : 250

const profileSeeds: Effect.Effect<number, Config.ConfigError> = Effect.map(
  Config.option(Config.String('CONFORMANCE_PROFILE')),
  seedsUnder,
)

Feature('An explored scenario runs a second time on a fresh build')
  .live(
    'each scenario starts a nested Vitest run over probe fixtures, whose file reads the simulation kernel cannot observe',
  )
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'a scenario with no choice point runs once, then once more',
      Gherkin.Do.pipe(
        Given('a passing explored scenario with no choice point')('run', () => runProbes({ globs: [PROBE] })),
        Then('it ran twice and passed')((s, expect) =>
          expect({ status: assertionOf(s.run.report, NO_CHOICE).status, runs: runsOf(s.run, 'no choice point') })
            .toEqual({ status: 'passed', runs: 2 })
        ),
      ),
    )

    scenario(
      'a scenario with a choice point runs its seeded schedules once, then only its baseline again',
      Gherkin.Do.pipe(
        Given('the profile seed count')('seeds', () => profileSeeds),
        Given('a passing explored scenario with a choice point')('run', () => runProbes({ globs: [PROBE] })),
        Then('it ran its baseline and every seed, then its baseline alone, and passed')((s, expect) =>
          expect({ status: assertionOf(s.run.report, CHOICE).status, runs: runsOf(s.run, 'choice point') })
            .toEqual({ status: 'passed', runs: s.seeds + 2 })
        ),
      ),
    )

    scenario(
      'state left behind by the first run fails the second run as LeakedState',
      Gherkin.Do.pipe(
        Given('an explored scenario reading a counter that outlives its run')(
          'run',
          () => runProbes({ globs: [PROBE] }),
        ),
        Then('the scenario fails as LeakedState carrying the second run failure')((s, expect) =>
          expect({ status: assertionOf(s.run.report, LEAK).status, message: messagesOf(s.run.report, LEAK) })
            .toMatchObject({ status: 'failed', message: expect.stringContaining('LeakedState') })
        ),
      ),
    )

    scenario(
      'a replayed decision path runs once, then once more',
      Gherkin.Do.pipe(
        Given('a scenario with a choice point replaying a decision path')(
          'run',
          () =>
            runProbes({
              globs: ['spec-runtime/replayed-path.integration.test.ts'],
              env: { CONFORMANCE_REPLAY: 'seed=0;path=0' },
            }),
        ),
        Then('it ran the path twice and passed')((s, expect) =>
          expect({ statuses: s.run.report.numFailedTests, runs: runsOf(s.run, 'replayed path') })
            .toEqual({ statuses: 0, runs: 2 })
        ),
      ),
    )

    scenario(
      'a replayed seed runs in the first run, so state it reads fails there with the seed',
      Gherkin.Do.pipe(
        Given('a scenario with no choice point replaying a seed')(
          'run',
          () =>
            runProbes({
              globs: ['spec-runtime/replayed-seed.integration.test.ts'],
              env: { CONFORMANCE_REPLAY: 'seed=3;path=' },
            }),
        ),
        Then('the scenario fails at the replayed seed, not as LeakedState')((s, expect) =>
          expect({
            status: assertionOf(s.run.report, SEEDED_LEAK).status,
            seeded: /\bseed=3\b/u.test(messagesOf(s.run.report, SEEDED_LEAK)),
            leaked: messagesOf(s.run.report, SEEDED_LEAK).includes('LeakedState'),
          }).toEqual({ status: 'failed', seeded: true, leaked: false })
        ),
      ),
    )
  })
