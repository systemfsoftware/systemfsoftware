import { assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'

const here = dirname(fromFileUrl(import.meta.url))
const command = (): string[] => {
  const given = Deno.env.get('TIMINGS')
  if (given !== undefined && given !== '') return [given]
  return [
    Deno.execPath(),
    'run',
    `--config=${join(here, '..', 'deno.jsonc')}`,
    `--lock=${join(here, '..', 'deno.lock')}`,
    '--frozen',
    '--allow-read',
    '--allow-write',
    '--allow-env',
    join(here, 'test-timings.ts'),
  ]
}

const run = async (cwd: string, args: string[], env: Record<string, string>): Promise<void> => {
  const [bin, ...rest] = command()
  const out = await new Deno.Command(bin!, { args: [...rest, ...args], cwd, env, stderr: 'inherit' }).output()
  assertEquals(out.code, 0, `${args[0]} exited ${out.code}`)
}

const write = async (path: string, text: string): Promise<void> => {
  await Deno.mkdir(dirname(path), { recursive: true })
  await Deno.writeTextFile(path, text)
}

Deno.test('plan, part and merge run against the workspace at the working directory', async () => {
  const root = await Deno.makeTempDir({ prefix: 'foreign-workspace-' })
  try {
    await write(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - libs/*\n  - "*/workerd"\n')
    await write(join(root, 'package.json'), JSON.stringify({ name: 'root', scripts: { test: 'turbo run test' } }))
    const pkgs: [string, string, boolean][] = [
      ['libs/a', '@x/a', true],
      ['libs/b', '@x/b', true],
      ['libs/docs', '@x/docs', false],
      ['api/workerd', '@x/api-workerd', true],
    ]
    for (const [dir, name, tested] of pkgs) {
      const scripts = tested ? { test: 'vitest run' } : { build: 'tsc' }
      await write(join(root, dir, 'package.json'), JSON.stringify({ name, scripts }))
    }
    await write(
      join(root, 'record.json'),
      JSON.stringify({ version: 2, packages: { '@x/a': { seconds: 700, sha: 's' }, '@x/b': { seconds: 40, sha: 's' } } }),
    )

    const output = join(root, 'github-output')
    await run(root, ['plan', '--record', 'record.json', '--target', '300', '--max-jobs', '8'], { GITHUB_OUTPUT: output })
    const line = (await Deno.readTextFile(output)).trim()
    const jobs = JSON.parse(line.slice('jobs='.length)) as { id: string; packages: string[]; dirs: string[] }[]
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
    await run(root, ['part', '--job', 'group-1', '--out', 'parts/group-1.json'], {})
    await run(root, ['merge', '--previous', 'record.json', '--parts', 'parts', '--out', 'next.json', '--sha', 'n'], {})
    const next = JSON.parse(await Deno.readTextFile(join(root, 'next.json')))
    assertEquals(next.packages['@x/b'], { seconds: 12, sha: 'n' })
    assertEquals(next.packages['@x/a'], { seconds: 700, sha: 's' })
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})
