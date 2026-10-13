import { assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { parse } from '@std/yaml'

// Runs the `reason` step of the shared failure-summary action, under the shell GitHub runs it with, on a job's
// steps context, and reads the reason code it annotates.

const action = join(
  dirname(fromFileUrl(import.meta.url)),
  '..',
  '..',
  '.github',
  'actions',
  'failure-summary',
  'action.yml',
)

type Action = { runs: { steps: { id?: string; run?: string }[] } }

const reasonScript = async (): Promise<string> => {
  const parsed = parse(await Deno.readTextFile(action)) as Action
  const step = parsed.runs.steps.find((candidate) => candidate.id === 'reason')
  if (step?.run === undefined) throw new Error(`${action} has no step with id reason`)
  return step.run
}

const MUTATION_REASONS =
  'sfs-deps sfs-deps-missing\ninstall install-failed\nbuild build-failed\nmutation mutation-failed\n'

/** The reason code and next action the summary writes for a job whose steps ended with these outcomes. */
const summarize = async (reasons: string, outcomes: Record<string, string>) => {
  const dir = await Deno.makeTempDir()
  const summary = join(dir, 'summary.md')
  await Deno.writeTextFile(summary, '')
  const script = join(dir, 'reason.sh')
  await Deno.writeTextFile(script, await reasonScript())
  const steps = Object.fromEntries(
    Object.entries(outcomes).map(([id, outcome]) => [id, { outcome, conclusion: outcome }]),
  )
  const out = await new Deno.Command('bash', {
    args: ['--noprofile', '--norc', '-eo', 'pipefail', script],
    env: {
      PATH: Deno.env.get('PATH') ?? '',
      REASONS: reasons,
      STEPS: JSON.stringify(steps),
      JOB: 'mutation-1',
      REPRODUCE: 'corepack pnpm --filter @x/a mutation',
      WORKING_DIRECTORY: '.',
      ARTIFACT: 'failure-log-mutation-1-1',
      RUNNER_TEMP: dir,
      GITHUB_STEP_SUMMARY: summary,
    },
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  const stdout = new TextDecoder().decode(out.stdout)
  const written = await Deno.readTextFile(summary)
  await Deno.remove(dir, { recursive: true })
  assertEquals(out.code, 0, new TextDecoder().decode(out.stderr))
  return { reason: /::error title=([^:]+)::/.exec(stdout)?.[1], summary: written }
}

Deno.test('a listed step the backstop cancelled is reported as timed-out and named', async () => {
  const { reason, summary } = await summarize(MUTATION_REASONS, {
    'sfs-deps': 'success',
    install: 'success',
    build: 'success',
    mutation: 'cancelled',
  })
  assertEquals(reason, 'timed-out')
  assertStringIncludes(summary, 'stopped mutation before it finished')
})

Deno.test('a failed step listed before a cancelled one keeps its own code', async () => {
  const { reason } = await summarize(MUTATION_REASONS, { install: 'success', build: 'failure', mutation: 'cancelled' })
  assertEquals(reason, 'build-failed')
})

Deno.test('a cancelled step listed before a failed one is reported as timed-out', async () => {
  const { reason } = await summarize(MUTATION_REASONS, { install: 'success', build: 'cancelled', mutation: 'failure' })
  assertEquals(reason, 'timed-out')
})

Deno.test('a cancelled step in a job with no reason table is reported as timed-out', async () => {
  const { reason } = await summarize('', { produce: 'cancelled' })
  assertEquals(reason, 'timed-out')
})

Deno.test('a failed step no table lists stays unclassified and is named', async () => {
  const { reason, summary } = await summarize(MUTATION_REASONS, { install: 'success', upload: 'failure' })
  assertEquals(reason, 'unclassified')
  assertStringIncludes(summary, 'No reason code covers the failed step (upload)')
})
