import { assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { parse } from '@std/yaml'

// Runs the plan job's `matrix` step from the shipped workflow against shard lists at and over GitHub's limit.
const workflow = join(
  dirname(fromFileUrl(import.meta.url)),
  '..',
  '..',
  '.github',
  'workflows',
  'reusable-mutation.yml',
)

interface Step {
  readonly id?: string
  readonly run?: string
  readonly env?: Readonly<Record<string, string | number>>
}

const matrixStep = async (): Promise<Step> => {
  const doc = parse(await Deno.readTextFile(workflow)) as { jobs: { plan: { steps: readonly Step[] } } }
  const step = doc.jobs.plan.steps.find((candidate) => candidate.id === 'matrix')
  if (step?.run === undefined) throw new Error('the plan job has no matrix step')
  return step
}

const runWith = async (shards: number): Promise<{ readonly code: number; readonly stdout: string }> => {
  const step = await matrixStep()
  const out = await new Deno.Command('bash', {
    args: ['-e', '-c', step.run ?? ''],
    env: {
      SHARD_COUNT: String(shards),
      MATRIX_LIMIT: String(step.env?.MATRIX_LIMIT),
    },
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  return { code: out.code, stdout: new TextDecoder().decode(out.stdout) }
}

Deno.test('Should_PassThePlan_When_TheShardMatrixHoldsExactlyGitHubsLimit', async () => {
  assertEquals((await runWith(256)).code, 0)
})

Deno.test('Should_FailNamingTheCount_When_TheShardMatrixExceedsGitHubsLimit', async () => {
  const over = await runWith(299)
  assertEquals([over.code, over.stdout.includes('need 299 shard jobs, over the 256')], [1, true])
})
