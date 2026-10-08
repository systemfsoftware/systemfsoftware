import { assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'

const here = dirname(fromFileUrl(import.meta.url))
const planner = [
  'run',
  `--config=${join(here, '..', 'deno.jsonc')}`,
  `--lock=${join(here, '..', 'deno.lock')}`,
  '--frozen',
  '--allow-read',
  '--allow-write',
  '--allow-env',
  join(here, 'test-timings.ts'),
]

type Job = { id: string; packages: string[]; dirs: string[] }

const run = async (cwd: string, args: string[]): Promise<void> => {
  const env = { GITHUB_OUTPUT: join(cwd, 'github-output'), GITHUB_STEP_SUMMARY: join(cwd, 'github-step-summary') }
  const out = await new Deno.Command(Deno.execPath(), { args: [...planner, ...args], cwd, env, stderr: 'inherit' })
    .output()
  assertEquals(out.code, 0, `${args[0]} exited ${out.code}`)
}

const plan = async (cwd: string, args: string[] = []): Promise<Job[]> => {
  await run(cwd, ['plan', '--target', '300', '--max-jobs', '8', ...args])
  const line = (await Deno.readTextFile(join(cwd, 'github-output'))).trim()
  return JSON.parse(line.slice('jobs='.length)) as Job[]
}

const write = async (path: string, text: string): Promise<void> => {
  await Deno.mkdir(dirname(path), { recursive: true })
  await Deno.writeTextFile(path, text)
}

const workspace = async (yaml: string, pkgs: readonly (readonly [string, string, boolean])[]): Promise<string> => {
  const root = await Deno.makeTempDir({ prefix: 'foreign-workspace-' })
  await write(join(root, 'pnpm-workspace.yaml'), yaml)
  await write(join(root, 'package.json'), JSON.stringify({ name: 'root', scripts: { test: 'turbo run test' } }))
  for (const [dir, name, tested] of pkgs) {
    const scripts = tested ? { test: 'vitest run' } : { build: 'tsc' }
    await write(join(root, dir, 'package.json'), JSON.stringify({ name, scripts }))
  }
  return root
}

const readOrEmpty = async (path: string | undefined): Promise<string> => {
  if (path === undefined) return ''
  try {
    return await Deno.readTextFile(path)
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return ''
    throw error
  }
}

Deno.test('plan, part and merge run against the workspace at the working directory', async () => {
  const jobSummary = Deno.env.get('GITHUB_STEP_SUMMARY')
  const jobSummaryBefore = await readOrEmpty(jobSummary)
  const root = await workspace('packages:\n  - libs/*\n  - "*/workerd"\n', [
    ['libs/a', '@x/a', true],
    ['libs/b', '@x/b', true],
    ['libs/docs', '@x/docs', false],
    ['api/workerd', '@x/api-workerd', true],
  ])
  try {
    await write(
      join(root, 'record.json'),
      JSON.stringify({
        version: 2,
        packages: { '@x/a': { seconds: 700, sha: 's' }, '@x/b': { seconds: 40, sha: 's' } },
      }),
    )

    const jobs = await plan(root, ['--record', 'record.json'])
    assertEquals(jobs.map((job) => job.id), ['a-1', 'a-2', 'a-3', 'group-1'])
    assertEquals(jobs.at(-1)!.packages, ['@x/api-workerd', '@x/b'])
    assertEquals(jobs.at(-1)!.dirs, ['api/workerd', 'libs/b'])

    await write(
      join(root, '.turbo/runs/run.json'),
      JSON.stringify({
        tasks: [{
          task: 'test',
          package: '@x/b',
          cache: { status: 'MISS' },
          execution: { startTime: 0, endTime: 12_000, exitCode: 0 },
        }],
      }),
    )
    await Deno.mkdir(join(root, 'parts'))
    await run(root, ['part', '--job', 'group-1', '--out', 'parts/group-1.json'])
    await run(root, ['merge', '--previous', 'record.json', '--parts', 'parts', '--out', 'next.json', '--sha', 'n'])
    const next = JSON.parse(await Deno.readTextFile(join(root, 'next.json')))
    assertEquals(next.packages['@x/b'], { seconds: 12, sha: 'n' })
    assertEquals(next.packages['@x/a'], { seconds: 700, sha: 's' })
    assertStringIncludes(
      await Deno.readTextFile(join(root, 'github-step-summary')),
      '| group-1 | @x/b | 0m12s | passed |',
    )
    assertEquals(await readOrEmpty(jobSummary), jobSummaryBefore)
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('plan enumerates what pnpm does: a ! glob excludes, overlapping globs list a package once', async () => {
  const root = await workspace('packages:\n  - packages/*\n  - packages/**\n  - "!packages/legacy"\n', [
    ['packages/app', '@n/app', true],
    ['packages/legacy', '@n/legacy', true],
    ['packages/deep/nested', '@n/nested', true],
  ])
  try {
    const jobs = await plan(root)
    assertEquals(jobs.flatMap((job) => job.packages).sort(), ['@n/app', '@n/nested'])
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})
