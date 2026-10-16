import { assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { parse } from '@std/yaml'

// Runs the `detect` step of the published conflict-check workflow, under the shell GitHub runs it with, in a clone
// whose `origin` holds the base branch.

const workflow = join(dirname(fromFileUrl(import.meta.url)), '..', '..', '.github', 'workflows', 'conflict-check.yml')

type Workflow = { jobs: { conflicts: { steps: { id?: string; run?: string }[] } } }

const detectScript = async (): Promise<string> => {
  const parsed = parse(await Deno.readTextFile(workflow)) as Workflow
  const step = parsed.jobs.conflicts.steps.find((candidate) => candidate.id === 'detect')
  if (step?.run === undefined) throw new Error(`${workflow} has no step with id detect`)
  return step.run
}

const gitEnv = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
}

const git = async (cwd: string, ...args: string[]) => {
  const out = await new Deno.Command('git', { args, cwd, env: gitEnv, stdout: 'null', stderr: 'piped' }).output()
  if (out.code !== 0) throw new Error(`git ${args.join(' ')}: ${new TextDecoder().decode(out.stderr)}`)
}

const commit = async (cwd: string, file: string, text: string) => {
  await Deno.writeTextFile(join(cwd, file), text)
  await git(cwd, 'add', file)
  await git(cwd, 'commit', '-q', '-m', `${file}: ${text.trim()}`)
}

/** The base branch `main` commits `baseChange`, the checked-out head commits `headChange`; both start from one commit. */
const detect = async (baseChange: [string, string], headChange: [string, string]) => {
  const dir = await Deno.makeTempDir()
  const upstream = join(dir, 'upstream')
  const work = join(dir, 'work')
  const runnerTemp = join(dir, 'runner-temp')
  await Deno.mkdir(upstream)
  await Deno.mkdir(runnerTemp)
  await git(upstream, 'init', '-q', '-b', 'main')
  await commit(upstream, 'shared.txt', 'start\n')
  await git(dir, 'clone', '-q', upstream, work)
  await commit(upstream, ...baseChange)
  await commit(work, ...headChange)
  const script = join(dir, 'detect.sh')
  await Deno.writeTextFile(script, await detectScript())
  const out = await new Deno.Command('bash', {
    args: ['--noprofile', '--norc', '-eo', 'pipefail', script],
    cwd: work,
    env: { ...gitEnv, BASE_REF: 'main', RUNNER_TEMP: runnerTemp },
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  const reason = await Deno.readTextFile(join(runnerTemp, 'sfs-reason')).catch(() => undefined)
  await Deno.remove(dir, { recursive: true })
  return { code: out.code, stdout: new TextDecoder().decode(out.stdout), reason }
}

Deno.test('a head that conflicts with its base fails the guard with the merge-conflict code', async () => {
  const result = await detect(['shared.txt', 'base\n'], ['shared.txt', 'head\n'])
  assertEquals(result.code, 1)
  assertEquals(result.reason, 'merge-conflict\n')
  assertStringIncludes(result.stdout, '::error title=merge conflicts::')
})

Deno.test('a head that merges cleanly passes the guard and names no reason', async () => {
  const result = await detect(['base.txt', 'base\n'], ['head.txt', 'head\n'])
  assertEquals(result.code, 0)
  assertEquals(result.reason, undefined)
})
