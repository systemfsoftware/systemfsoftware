import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import * as Layer from 'effect/Layer'
import { replayRunOutput, seedOfCheckedOutCommit, zeroCommitCiEnv } from './__fixtures__/replay-run'

const Feature = makeFeature({ it })

const RERUN_TAIL = 'src/a.test.ts -t "Should_BeRefuted_When_Run"'
const rerunWith = (configArg: string): string =>
  `pnpm --filter @scope/pkg exec vitest run --config ${configArg} ${RERUN_TAIL}`

Feature('Rerunning a refuted property with the config the run loaded')
  .live('each scenario starts a nested Vitest run whose config file the simulation kernel cannot observe')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A refuted property reprints its rerun line carrying the loaded config file',
      Gherkin.Do.pipe(
        Given('a run whose config adds the replay plugin and whose test fails with a rerun line')(
          'output',
          () => replayRunOutput({ fixture: 'replay-config', file: 'refuted.probe.ts' }),
        ),
        Then('the reprinted line names the config file after the vitest run command')((s, expect) =>
          expect(s.output).toContain(rerunWith('vitest.config.ts'))
        ),
      ),
    )
    scenario(
      'A run whose tests pass reprints nothing',
      Gherkin.Do.pipe(
        Given('a run whose config adds the replay plugin and whose test passes')(
          'output',
          () => replayRunOutput({ fixture: 'replay-config', file: 'passing.probe.ts' }),
        ),
        Then('no rerun line is reprinted')((s, expect) =>
          expect(s.output).not.toContain('Rerun with the config this run loaded')
        ),
      ),
    )
    scenario(
      'A config whose test root is a subdirectory prints its path from the package directory',
      Gherkin.Do.pipe(
        Given('a package whose config sets the test root to a subdirectory holding the failing test')(
          'output',
          () => replayRunOutput({ fixture: 'replay-subroot', file: 'refuted.probe.ts' }),
        ),
        Then('the path is the one from the package directory, not from the test root')((s, expect) =>
          expect(s.output).toContain(rerunWith('vitest.config.ts'))
        ),
      ),
    )
    scenario(
      'A config path containing a space is quoted',
      Gherkin.Do.pipe(
        Given('a package whose config file sits in a directory with a space in its name')(
          'output',
          () =>
            replayRunOutput({
              fixture: 'replay-spaced',
              file: 'refuted.probe.ts',
              config: 'my config/vitest.config.ts',
            }),
        ),
        Then('the path is one quoted word')((s, expect) =>
          expect(s.output).toContain(rerunWith("'my config/vitest.config.ts'"))
        ),
      ),
    )
    scenario(
      'A refuted test names the config of the project that ran it',
      Gherkin.Do.pipe(
        Given(
          'a package whose root config lists two projects, each with its own config and the plugin, and one refuted test in beta',
        )(
          'output',
          () => replayRunOutput({ fixture: 'replay-projects', file: 'beta/refuted.probe.ts' }),
        ),
        Then("the line carries beta's config, not the root config")((s, expect) =>
          expect(s.output).toContain(rerunWith('beta/vitest.config.ts'))
        ),
      ),
    )
    scenario(
      'A local run gets a hundred runs and no seed',
      Gherkin.Do.pipe(
        Given('a run on the local tier')(
          'output',
          () => replayRunOutput({ fixture: 'replay-config', file: 'budget.probe.ts' }),
        ),
        Then('the budget is a hundred runs')((s, expect) => expect(s.output).toContain('BUDGET {"runs":100}')),
      ),
    )
    scenario(
      'A CI run gets a thousand runs and a seed from the checked-out commit',
      Gherkin.Do.pipe(
        Given('a run on the CI tier')(
          'output',
          () => replayRunOutput({ fixture: 'replay-config', file: 'budget.probe.ts', env: { CI: 'true' } }),
        ),
        Then('the budget is a thousand runs seeded from the commit, with no seed-store writes')((s, expect) =>
          expect(s.output).toContain(`BUDGET {"runs":1000,"record":false,"seed":${seedOfCheckedOutCommit()}}`)
        ),
      ),
    )
    scenario(
      'A CI run whose commit begins with eight zeros is seeded with one',
      Gherkin.Do.pipe(
        Given('a run on the CI tier where git reports a commit beginning with eight zeros')(
          'output',
          () =>
            replayRunOutput({
              fixture: 'replay-config',
              file: 'budget.probe.ts',
              env: zeroCommitCiEnv,
            }),
        ),
        Then('the seed is one')((s, expect) =>
          expect(s.output).toContain('BUDGET {"runs":1000,"record":false,"seed":1}')
        ),
      ),
    )
    scenario(
      'A run in a Stryker worker gets the mutation tier, seeded from the commit',
      Gherkin.Do.pipe(
        Given('a run inside a Stryker worker')(
          'output',
          () =>
            replayRunOutput({
              fixture: 'replay-config',
              file: 'budget.probe.ts',
              env: { CI: 'true', STRYKER_MUTATOR_WORKER: '1' },
            }),
        ),
        Then('the budget is thirty runs seeded from the commit')((s, expect) =>
          expect(s.output).toContain(`BUDGET {"runs":30,"record":false,"seed":${seedOfCheckedOutCommit()}}`)
        ),
      ),
    )
    scenario(
      "A CI run whose commit git cannot read fails naming the directory and git's message",
      Gherkin.Do.pipe(
        Given('a run on the CI tier where git finds no repository')(
          'output',
          () =>
            replayRunOutput({
              fixture: 'replay-config',
              file: 'budget.probe.ts',
              env: { CI: 'true', GIT_DIR: '/nonexistent/.git' },
            }),
        ),
        Then('the failure says where git looked and what it said')((s, expect) =>
          expect(s.output).toMatch(
            /git rev-parse HEAD could not read the commit in .*replay-config: .*not a git repository/su,
          )
        ),
      ),
    )
  })
