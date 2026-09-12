import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

import * as S from 'effect/Schema'
import { expect } from 'vitest'
const checkExpect = expect
import { ManifestViewSchema, ReportsSchema } from './__fixtures__/packaged-artifact.schema.js'
import { fixtureDir, WORKDIR } from './__fixtures__/stryker-cli-env.js'
import { layerStrykerCli, StrykerCli } from './__fixtures__/StrykerCliAdapter.js'

const Feature = makeFeature({ it, layer })

const CLI_PACKAGE = '@systemfsoftware/stryker-js-cli'
const EVERY_REPORT_FIXTURE = 'html-report-project'

interface ObservedRun {
  readonly exitCode: number
  readonly reports: S.Schema.Type<typeof ReportsSchema>
}

const installedWithIt = (root: string): Effect.Effect<readonly string[], never, StrykerCli> =>
  Effect.gen(function*() {
    const cli = yield* StrykerCli
    const listed = yield* cli.sh('ls -1 node_modules/@systemfsoftware', { cwd: root })
    return listed.stdout.split('\n').filter((line) => line.trim().length > 0)
  })

const manifestOf = (root: string): Effect.Effect<S.Schema.Type<typeof ManifestViewSchema>, never, StrykerCli> =>
  Effect.gen(function*() {
    const cli = yield* StrykerCli
    const printed = yield* cli.sh(
      `node -e "const m=JSON.parse(require('fs').readFileSync('node_modules/${CLI_PACKAGE}/package.json','utf8'));process.stdout.write(JSON.stringify({dependencies:Object.keys(m.dependencies ?? {}),exports:Object.keys(m.exports ?? {})}))"`,
      { cwd: root },
    )
    return yield* S.decodeEffect(ManifestViewSchema)(printed.stdout).pipe(Effect.orDie)
  })

const runOnItsOwn = (fixture: string): Effect.Effect<ObservedRun, never, StrykerCli> =>
  Effect.gen(function*() {
    const cli = yield* StrykerCli
    const cwd = fixtureDir(fixture)
    const run = yield* cli.run(['run'], { cwd })
    const read = yield* cli.sh(
      `node -e "const fs=require('fs');const html=fs.readFileSync('reports/mutation-report.html','utf8');process.stdout.write(JSON.stringify({htmlBytes:html.length,viewerBundle:html.includes('MutationTestElements'),jsonBytes:fs.statSync('reports/mutation-report.json').size}))"`,
      { cwd },
    )
    return { exitCode: run.exitCode, reports: yield* S.decodeEffect(ReportsSchema)(read.stdout).pipe(Effect.orDie) }
  })

Feature('Installing the mutation tester')
  .withLayer(layerStrykerCli)
  .liveClock()
  .body(({ scenario }) => {
    scenario(
      'Installing with no network brings the tester and nothing else',
      Gherkin.Do.pipe(
        Given('a machine where the tester was installed with no network access')('root', () => Effect.succeed(WORKDIR)),
        When('the packages that arrived with it, and its own manifest, are read')('closure', (s) =>
          Effect.all(
            {
              installed: installedWithIt(s.root),
              manifest: manifestOf(s.root),
            },
            { concurrency: 'unbounded' },
          )),
        Then('the tester is the only package that arrived')((s) => {
          checkExpect(s.closure.installed).toEqual(['stryker-js-cli'])
        }),
        Then('it asks for no other package to be installed alongside it')((s) => {
          checkExpect(s.closure.manifest.dependencies).toEqual([])
        }),
        Then('it publishes nothing to import but its own manifest')((s) => {
          checkExpect(s.closure.manifest.exports).toEqual(['./package.json'])
        }),
      ),
    )

    scenario(
      'A project asking for both reports gets them from the tester alone',
      Gherkin.Do.pipe(
        Given('a machine that holds only the tester, and a project asking for both reports')(
          'fixture',
          () => Effect.succeed(EVERY_REPORT_FIXTURE),
        ),
        When('the agent asks for a mutation run')('observed', (s) => runOnItsOwn(s.fixture)),
        Then('the run succeeds')((s) => {
          checkExpect(s.observed.exitCode).toBe(0)
        }),
        Then('the html report is rendered by the viewer built into the tester')((s) => {
          checkExpect(s.observed.reports.viewerBundle).toBe(true)
          checkExpect(s.observed.reports.htmlBytes).toBeGreaterThan(100_000)
        }),
        Then('the json report is written as well')((s) => {
          checkExpect(s.observed.reports.jsonBytes).toBeGreaterThan(0)
        }),
      ),
    )
  })
