import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as S from 'effect/Schema'
import { expect } from 'vitest'

import { type StreamLine, StreamLineSchema } from './__fixtures__/cli-contract.schema.js'
import { WORKDIR } from './__fixtures__/stryker-cli-env.js'
import { layerStrykerCli, StrykerCli } from './__fixtures__/StrykerCliAdapter.js'

const checkExpect = expect

interface Observed {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly lines: readonly StreamLine[]
}

const decodeStreamLine = S.decodeUnknownSync(S.fromJsonString(StreamLineSchema))

const parseStream = (stdout: string): readonly StreamLine[] =>
  stdout
    .split('\n')
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => decodeStreamLine(line))

const invoke = (
  args: readonly string[],
  env?: Record<string, string>,
): Effect.Effect<Observed, never, StrykerCli> =>
  Effect.gen(function*() {
    const cli = yield* StrykerCli
    const cwd = WORKDIR
    const result = yield* cli.run(args, {
      cwd,
      ...((() => {
        if (env === undefined) {
          return {}
        }
        return { env }
      })()),
    })
    const streamCat = yield* cli.sh('cat reports/mutation-stream.jsonl 2>/dev/null || true', { cwd })
    let source = result.stdout
    if (streamCat.stdout.trim().length > 0) {
      source = streamCat.stdout
    }
    return { ...result, lines: parseStream(source) }
  })

const Feature = makeFeature({ it, layer })

Feature('CLI help regression')
  .withLayer(layerStrykerCli)
  .liveClock()
  .body(({ scenario }) => {
    scenario(
      'Should_emit_help_When_bare_or_flag_in_machine_mode',
      Gherkin.Do.pipe(
        When('the harness asks for help')('helpObserved', () => invoke(['--help'])),
        When('the harness invokes the tool with nothing at all')('bareObserved', () => invoke([])),
        Then('both invocations succeed with the usage text and no verdict')((s) => {
          checkExpect(s.helpObserved.exitCode).toBe(0)
          const helpTerminal = s.helpObserved.lines.at(-1)
          checkExpect(helpTerminal).toMatchObject({ kind: 'help', code: 0 })
          checkExpect(String(helpTerminal?.['help'])).toContain('USAGE')
          checkExpect(s.helpObserved.lines.map((line) => line['kind'])).not.toContain('verdict')

          checkExpect(s.bareObserved.exitCode).toBe(0)
          const bareTerminal = s.bareObserved.lines.at(-1)
          checkExpect(bareTerminal).toMatchObject({ kind: 'help', code: 0 })
          checkExpect(String(bareTerminal?.['help'])).toContain('USAGE')
          checkExpect(s.bareObserved.lines.map((line) => line['kind'])).not.toContain('verdict')
        }),
      ),
    )

    scenario(
      'Should_print_prose_When_human_mode',
      Gherkin.Do.pipe(
        Given('a human-facing invocation')('observed', () => invoke(['--help'], { STRYKER_MODE: 'human' })),
        Then('the output reads as prose and no machine line is written')((s) => {
          checkExpect(s.observed.exitCode).toBe(0)
          checkExpect(s.observed.stdout).toContain('USAGE')
          checkExpect(s.observed.lines).toEqual([])
        }),
      ),
    )

    scenario(
      'Should_keep_llms_When_invoked',
      Gherkin.Do.pipe(
        Given('a harness asking for the manifest')('observed', () => invoke(['--llms'])),
        Then('the description follows the stream header')((s) => {
          checkExpect(s.observed.exitCode).toBe(0)
          const first = s.observed.lines[0]
          const last = s.observed.lines.at(-1)
          checkExpect(first).toMatchObject({ kind: 'stream' })
          checkExpect(last).toMatchObject({ kind: 'manifest', code: 0 })
        }),
      ),
    )
  })
