// The Mutation lane reads the plan file `stryker plan --out` writes (scripts/tools/mutation-plan.ts). This test
// holds a plan the installed `@systemfsoftware/stryker-js` 17.0.2 CLI wrote (recorded below) and requires the
// `ShardPlan` schema the CLI's own contract package publishes to decode it, and counts the mutants it lists. A
// recorded CLI output is an oracle the planner did not produce (CONST-T10), so a CLI or contract upgrade that
// changes the plan file's shape fails here. The package declares both `@systemfsoftware/stryker-js` and
// `@systemfsoftware/stryker-js-cli-contract`, so a lockfile move of either re-runs this test through turbo's
// `hashOfExternalDependencies`.
import { ShardPlan } from '@systemfsoftware/stryker-js-cli-contract'
import { it } from '@systemfsoftware/vitest'
import { Result, Schema } from 'effect'

/**
 * The plan `stryker plan --full --target-seconds 900 --out plan.json` wrote with @systemfsoftware/stryker-js 17.0.2,
 * recorded from a project holding `src/decide.workflow.ts`
 * (`export const decide = (n: number): number => (n > 0 ? n + 1 : n - 1)`) and a `stryker.config.mjs` of
 * `{ mutate: ['src/**\/*.workflow.ts'], testRunner: 'command', commandRunner: { command: 'true' } }`. The CLI printed
 * `Found 1 of 3 file(s) to be mutated.` and planned 8 mutants. Re-record it when this test fails on an intentional
 * Stryker upgrade.
 */
const RECORDED_PLAN = {
  version: 1,
  targetSeconds: 900,
  shards: [{
    index: 1,
    count: 1,
    predictedSeconds: 8,
    projects: [{
      project: '.',
      mutants: [
        '1ebecf5697ce0e45',
        '3682a93ed9264f8a',
        '43a71f44b2f1b221',
        '5227fc4afef5175a',
        'b3ffc15420108d73',
        'c09126a73680cdd3',
        'c121e048f514e740',
        'e31a4f63530cec52',
      ],
    }],
  }],
  matrix: { include: [{ shard: '1/1', predictedSeconds: 8 }] },
}

/** The number of mutants a `stryker plan --out` file plans, or why the file is not a version 1 shard plan. */
const plannedMutantCountOf = (text: string): Result.Result<number, string> =>
  Result.match(Schema.decodeUnknownResult(Schema.fromJsonString(ShardPlan))(text), {
    onSuccess: (plan) =>
      Result.succeed(
        plan.shards.reduce(
          (total, shard) => total + shard.projects.reduce((sum, project) => sum + project.mutants.length, 0),
          0,
        ),
      ),
    onFailure: (error) => Result.fail(error.message),
  })

it('the installed Stryker contract decodes a plan the 17.0.2 CLI wrote, and it plans 8 mutants', function*({
  expect,
}) {
  yield* expect(plannedMutantCountOf(JSON.stringify(RECORDED_PLAN, null, 2))).toEqual(Result.succeed(8))
})
