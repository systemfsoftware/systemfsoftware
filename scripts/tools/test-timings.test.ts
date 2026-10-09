import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { honoursShard, planJobs, type TestPackage } from './test-timings.ts'

const here = dirname(fromFileUrl(import.meta.url))
const planner = [
  'run',
  `--config=${join(here, '..', 'deno.jsonc')}`,
  `--lock=${join(here, '..', 'deno.lock')}`,
  '--frozen',
  '--allow-read',
  '--allow-write',
  '--allow-env',
  '--allow-run=pnpm',
  join(here, 'test-timings.ts'),
]

type Job = { id: string; packages: string[]; dirs: string[] }

const exec = (cwd: string, args: string[]) => {
  const env = { GITHUB_OUTPUT: join(cwd, 'github-output'), GITHUB_STEP_SUMMARY: join(cwd, 'github-step-summary') }
  return new Deno.Command(Deno.execPath(), { args: [...planner, ...args], cwd, env, stdout: 'piped', stderr: 'piped' })
    .output()
}

const run = async (cwd: string, args: string[]): Promise<string> => {
  const out = await exec(cwd, args)
  const stderr = new TextDecoder().decode(out.stderr)
  assertEquals(out.code, 0, `${args[0]} exited ${out.code}: ${stderr}`)
  return stderr
}

const plan = async (cwd: string, args: string[] = []): Promise<Job[]> => {
  await Deno.remove(join(cwd, 'github-output')).catch(() => {})
  await run(cwd, ['plan', '--target', '300', '--max-jobs', '8', ...args])
  const line = (await Deno.readTextFile(join(cwd, 'github-output'))).trim()
  return JSON.parse(line.slice('jobs='.length)) as Job[]
}

const write = async (path: string, text: string): Promise<void> => {
  await Deno.mkdir(dirname(path), { recursive: true })
  await Deno.writeTextFile(path, text)
}

const workspace = async (
  yaml: string,
  pkgs: readonly (readonly [string, string, boolean | string])[],
): Promise<string> => {
  const root = await Deno.makeTempDir({ prefix: 'foreign-workspace-' })
  await write(join(root, 'pnpm-workspace.yaml'), yaml)
  await write(join(root, 'package.json'), JSON.stringify({ name: 'root', scripts: { test: 'turbo run test' } }))
  for (const [dir, name, tested] of pkgs) {
    const scripts = typeof tested === 'string' ? { test: tested } : tested ? { test: 'vitest run' } : { build: 'tsc' }
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

const pnpmTested = async (root: string): Promise<string[]> => {
  const out = await new Deno.Command('pnpm', { args: ['ls', '-r', '--depth', '-1', '--json'], cwd: root }).output()
  const members = JSON.parse(new TextDecoder().decode(out.stdout)) as { path: string }[]
  const names: string[] = []
  for (const { path } of members) {
    const json = JSON.parse(await Deno.readTextFile(join(path, 'package.json')))
    if (json.name !== 'root' && json.scripts?.test !== undefined) names.push(json.name)
  }
  return names.sort()
}

Deno.test('plan enumerates exactly what pnpm does: ! exclusions in every documented form, overlapping globs', async () => {
  const root = await workspace(
    [
      'packages:',
      '  - packages/*',
      '  - packages/**',
      '  - libs/**',
      '  - "!**/test/**"',
      '  - "!./packages/legacy"',
      '  - "!libs/old/**"',
      '',
    ].join('\n'),
    [
      ['packages/app', '@n/app', true],
      ['packages/legacy', '@n/legacy', true],
      ['packages/deep/nested', '@n/nested', true],
      ['packages/app/test/fixture', '@n/fixture', true],
      ['libs/kept', '@n/kept', true],
      ['libs/old', '@n/old', true],
      ['libs/old/sub', '@n/old-sub', true],
    ],
  )
  try {
    const planned = (await plan(root)).flatMap((job) => job.packages).sort()
    assertEquals(planned, await pnpmTested(root))
    assertEquals(planned, ['@n/app', '@n/kept', '@n/nested'])
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('an oversized package whose script ignores --shard runs whole, and its merge keeps its measured time', async () => {
  const root = await workspace('packages:\n  - apps/*\n', [
    ['apps/slow', '@x/slow', 'node --test test/*.test.ts'],
    ['apps/fast', '@x/fast', true],
  ])
  try {
    await write(
      join(root, 'record.json'),
      JSON.stringify({ version: 2, packages: { '@x/slow': { seconds: 900, sha: 's' } } }),
    )
    const jobs = (await plan(root, ['--record', 'record.json'])) as (Job & { shard?: unknown })[]
    const slow = jobs.filter((job) => job.packages.includes('@x/slow'))
    assertEquals(slow.length, 1)
    assertEquals(slow[0]!.packages, ['@x/slow'])
    assertEquals(slow[0]!.shard, undefined)
    assertStringIncludes(
      await run(root, ['plan', '--target', '300', '--record', 'record.json']),
      '@x/slow: predicted 15m00s',
    )

    await Deno.mkdir(join(root, 'parts'))
    await run(root, [
      'part',
      '--job',
      slow[0]!.id,
      '--out',
      'parts/slow.json',
      '--package',
      '@x/slow',
      '--seconds',
      '880',
      '--exit',
      '0',
    ])
    await run(root, ['merge', '--previous', 'record.json', '--parts', 'parts', '--out', 'next.json', '--sha', 'n'])
    const next = JSON.parse(await Deno.readTextFile(join(root, 'next.json')))
    assertEquals(next.packages['@x/slow'], { seconds: 880, sha: 'n' })
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('--max-jobs caps every planned job, shards included, and every package is still planned', async () => {
  const root = await workspace('packages:\n  - pkgs/*\n', [
    ['pkgs/platform', '@x/platform', true],
    ['pkgs/a', '@x/a', true],
    ['pkgs/b', '@x/b', 'node --test'],
  ])
  try {
    await write(
      join(root, 'record.json'),
      JSON.stringify({ version: 2, packages: { '@x/platform': { seconds: 3600, sha: 's' } } }),
    )
    const jobs = (await plan(root, ['--record', 'record.json'])) as (Job & { shard?: { index: number } })[]
    assertEquals(jobs.length <= 8, true, `${jobs.length} jobs`)
    assertEquals(jobs.filter((job) => job.shard === undefined).length >= 1, true)
    const shards = jobs.filter((job) => job.shard !== undefined).map((job) => job.shard!.index)
    assertEquals(shards, Array.from({ length: shards.length }, (_unused, i) => i + 1))
    assertEquals([...new Set(jobs.flatMap((job) => job.packages))].sort(), ['@x/a', '@x/b', '@x/platform'])
    assertStringIncludes(
      await run(root, ['plan', '--target', '300', '--max-jobs', '8', '--record', 'record.json']),
      '--max-jobs 8 caps @x/platform',
    )
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('a workspace with no package carrying the task script fails the plan', async () => {
  const root = await workspace('catalog:\n  effect: 4.0.0\n', [])
  try {
    const out = await exec(root, ['plan'])
    assertEquals(out.code === 0, false)
    assertStringIncludes(new TextDecoder().decode(out.stderr), 'an empty plan is never a passing gate')
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('plan refuses a target, job cap or default duration that is not a number over 0, naming the flag', async () => {
  const root = await workspace('packages:\n  - p/*\n', [['p/a', '@x/a', true]])
  try {
    const cases: readonly (readonly [string, string])[] = [
      ['--target', '0'],
      ['--target', '-1'],
      ['--max-jobs', 'abc'],
      ['--max-jobs', ''],
      ['--max-jobs', '2.5'],
      ['--unknown-seconds', 'NaN'],
    ]
    for (const [flag, value] of cases) {
      const out = await exec(root, ['plan', flag, value])
      assertEquals(out.code === 0, false, `${flag} ${value} exited 0`)
      assertStringIncludes(new TextDecoder().decode(out.stderr), `${flag} must be`)
    }
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('a script shards only when its last command is a vitest run with flags', () => {
  for (
    const script of [
      'vitest run',
      'vitest run --passWithNoTests',
      'vitest run --config vitest.config.ts',
      'vitest run --project unit --project conformance --project integration',
      'pnpm --filter @acme/web build && vitest run',
      'tsc -b && vitest run --config=vitest.config.ts',
      'vitest run --coverage.enabled',
      'vitest run --update --coverage.provider=v8 --browser.headless',
    ]
  ) assertEquals(honoursShard(script), true, script)
  for (
    const script of [
      'node --test test/*.test.ts',
      'ttsx --project tsconfig.json test',
      'pnpm test:unit',
      'turbo --concurrency=${TURBO_CONCURRENCY:-50%} test',
      'vitest run && node check.js',
      'vitest run; echo done',
      'vitest run | tee log',
      'vitest',
      'vitest run --',
      'vitest run -- --bail',
      'vitest run --tagsFilter "!browser"',
    ]
  ) assertEquals(honoursShard(script), false, script)
})

const shardable = (name: string): TestPackage => ({ name, dir: name, browser: false, shardable: true })
const recordOf = (entries: readonly (readonly [string, number])[]) => ({
  version: 2 as const,
  packages: Object.fromEntries(entries.map(([name, seconds]) => [name, { seconds, sha: 's' }])),
})
const limits = { target: 300, maxJobs: 12, maxSeconds: 1800, unknownSeconds: 60 }

Deno.test('no planned job is predicted over --max-seconds, even when that means passing --max-jobs', () => {
  const cases: readonly (readonly [string, readonly (readonly [string, number])[]])[] = [
    ['39 packages at 600s', Array.from({ length: 39 }, (_unused, i) => [`@x/p${i}`, 600] as const)],
    [
      '3 at 1200s and 36 at 250s',
      [
        ...Array.from({ length: 3 }, (_unused, i) => [`@x/big${i}`, 1200] as const),
        ...Array.from({ length: 36 }, (_unused, i) => [`@x/small${i}`, 250] as const),
      ],
    ],
  ]
  for (const [label, entries] of cases) {
    const plan = planJobs(entries.map(([name]) => shardable(name)), recordOf(entries), limits)
    const worst = Math.max(...plan.jobs.map((job) => job.predicted))
    assertEquals(worst <= 1800, true, `${label}: a job is predicted at ${worst}s`)
    const covered = new Set(plan.jobs.flatMap((job) => job.packages))
    assertEquals(covered.size, entries.length, label)
    if (plan.jobs.length > 12) assertStringIncludes(plan.warnings.join('\n'), '--max-seconds 1800')
  }
})

Deno.test('merge refuses a target or default duration that is not a number over 0, naming the flag', async () => {
  const root = await workspace('packages:\n  - p/*\n', [['p/a', '@x/a', true]])
  try {
    await Deno.mkdir(join(root, 'parts'))
    for (const [flag, value] of [['--target', 'abc'], ['--unknown-seconds', 'NaN'], ['--unknown-seconds', '-5']]) {
      const out = await exec(root, ['merge', '--parts', 'parts', '--out', 'next.json', flag!, value!])
      assertEquals(out.code === 0, false, `${flag} ${value} exited 0`)
      assertStringIncludes(new TextDecoder().decode(out.stderr), `${flag} must be`)
    }
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('plan refuses a --max-seconds below --target, naming both flags', async () => {
  const root = await workspace('packages:\n  - p/*\n', [['p/a', '@x/a', true]])
  try {
    const out = await exec(root, ['plan', '--target', '300', '--max-seconds', '180'])
    assertEquals(out.code === 0, false)
    assertStringIncludes(new TextDecoder().decode(out.stderr), '--max-seconds 180 is below --target 300')
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('part refuses a --seconds or --exit that is not a number of 0 or more, naming the flag', async () => {
  const root = await workspace('packages:\n  - p/*\n', [['p/a', '@x/a', true]])
  try {
    for (const [flag, value] of [['--seconds', 'abc'], ['--seconds', '5e999'], ['--seconds', '-1'], ['--exit', 'x']]) {
      const args = ['part', '--job', 'j', '--out', 'j.json', '--package', '@x/a', '--seconds', '5', '--exit', '0']
      args[args.indexOf(flag!) + 1] = value!
      const out = await exec(root, args)
      assertEquals(out.code === 0, false, `${flag} ${value} exited 0`)
      assertStringIncludes(new TextDecoder().decode(out.stderr), `${flag} must be`)
    }
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('merge keeps the recorded time when a part carries no finite seconds', async () => {
  const root = await workspace('packages:\n  - p/*\n', [['p/a', '@x/a', true]])
  try {
    await write(
      join(root, 'record.json'),
      JSON.stringify({ version: 2, packages: { '@x/a': { seconds: 500, sha: 's' } } }),
    )
    await write(
      join(root, 'parts/j.json'),
      JSON.stringify({ job: 'j', entries: [{ package: '@x/a', seconds: null, exitCode: 0 }] }),
    )
    await run(root, ['merge', '--previous', 'record.json', '--parts', 'parts', '--out', 'next.json', '--sha', 'n'])
    const next = JSON.parse(await Deno.readTextFile(join(root, 'next.json')))
    assertEquals(next.packages['@x/a'], { seconds: 500, sha: 's' })
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test("latest picks main's newest live record from every page, not just the first", async () => {
  const root = await workspace('packages:\n  - p/*\n', [['p/a', '@x/a', true]])
  try {
    const branch = (id: number, head_branch: string, expired = false) => ({
      id,
      expired,
      workflow_run: { head_branch },
    })
    const firstPage = { artifacts: Array.from({ length: 100 }, (_unused, i) => branch(1000 - i, 'feature')) }
    const secondPage = { artifacts: [branch(7, 'main', true), branch(5, 'main'), branch(3, 'main')] }
    await write(join(root, 'listing.json'), JSON.stringify([firstPage, secondPage]))
    const latest = async () => {
      const out = await exec(root, ['latest', '--listing', 'listing.json'])
      assertEquals(out.code, 0, new TextDecoder().decode(out.stderr))
      return new TextDecoder().decode(out.stdout).trim()
    }
    assertEquals(await latest(), '5')
    await write(join(root, 'listing.json'), JSON.stringify([{ artifacts: [branch(9, 'feature')] }]))
    assertEquals(await latest(), '9')
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('latest picks the newest record by creation time, not by its place in the listing', async () => {
  const root = await workspace('packages:\n  - p/*\n', [['p/a', '@x/a', true]])
  try {
    const made = (id: number, created_at: string, head_branch: string) => ({
      id,
      expired: false,
      created_at,
      workflow_run: { head_branch },
    })
    const artifacts = [
      made(11580180861, '2026-10-08T21:17:16Z', 'queue/1'),
      made(11579746689, '2026-10-08T21:16:17Z', 'feature'),
      made(11579712726, '2026-10-08T21:25:32Z', 'main'),
      made(11578784678, '2026-10-08T21:22:41Z', 'feature'),
      made(11578000000, '2026-10-08T21:30:00Z', 'main'),
    ]
    await write(join(root, 'listing.json'), JSON.stringify([{ artifacts }]))
    const latest = async (branch: string) => {
      const out = await exec(root, ['latest', '--listing', 'listing.json', '--branch', branch])
      assertEquals(out.code, 0, new TextDecoder().decode(out.stderr))
      return new TextDecoder().decode(out.stdout).trim()
    }
    assertEquals(await latest('feature'), '11578784678')
    assertEquals(await latest('other'), '11578000000')
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('job ids stay unique when packages share an unscoped name, or are named group', () => {
  const plan = planJobs(
    ['@a/util', '@b/util', 'group', '@c/solo'].map(shardable),
    recordOf([['@a/util', 900], ['@b/util', 900], ['group', 900], ['@c/solo', 30]]),
    limits,
  )
  const ids = plan.jobs.map((job) => job.id)
  assertEquals(new Set(ids).size, ids.length, `duplicate ids in ${ids.join(' ')}`)
  assertEquals(ids.filter((id) => id.startsWith('a-util-')).length, 3)
  assertEquals(ids.filter((id) => id.startsWith('b-util-')).length, 3)
})

Deno.test('a script that runs shell substitution inside a vitest flag value is not shardable', () => {
  for (
    const script of [
      'vitest run --exclude `whoami`',
      'vitest run --exclude $(whoami)',
      'vitest run --reporter=x`id`',
      'vitest run --config=$CONFIG',
    ]
  ) assertEquals(honoursShard(script), false, script)
})

Deno.test('a script with any shell-active character, or a flag that would swallow --shard, is not shardable', () => {
  for (
    const script of [
      'vitest run --exclude >out.txt',
      'vitest run >out.txt',
      'vitest run --foo=a>b',
      'vitest run --exclude <in.txt',
      'vitest run --config=x\\',
      'vitest run --config=x\\y',
      "vitest run --exclude '*.test.ts",
      'vitest run --exclude "*.test.ts',
      "vitest run --exclude '*.test.ts'",
      'vitest run & wait',
      'vitest run --pool=a&b',
      'build || vitest run',
      "echo ' && vitest run",
      'vitest run --reporter -',
    ]
  ) assertEquals(honoursShard(script), false, script)
})

Deno.test('a slug collision blocks the plan only when a planned job would carry the id', () => {
  const small = planJobs(
    ['@a/util', '@b/util', '@c/a-util', 'group', 'pkg-group'].map(shardable),
    recordOf([['@a/util', 30], ['@b/util', 30], ['@c/a-util', 30], ['group', 30], ['pkg-group', 30]]),
    limits,
  )
  assertEquals(small.jobs.map((job) => job.id), ['group-1'])
  const error = assertThrows(() =>
    planJobs(
      ['@a/util', '@b/util', '@c/a-util'].map(shardable),
      recordOf([['@a/util', 900], ['@b/util', 900], ['@c/a-util', 900]]),
      limits,
    )
  )
  assertStringIncludes(String(error), '@a/util, @c/a-util')
})

const dryOf = (tasks: readonly [string, string, string | undefined][]) =>
  JSON.stringify({
    tasks: tasks.map(([pkg, hash, status]) => ({
      task: 'test',
      package: pkg,
      hash,
      cache: status === undefined ? { status: 'MISS', remote: false } : { status, remote: true },
    })),
  })

Deno.test('a workspace whose every test task is a remote cache hit plans no job and lists each skip', async () => {
  const root = await workspace('packages:\n  - p/*\n', [['p/a', '@x/a', true], ['p/b', '@x/b', true]])
  try {
    await write(join(root, 'dry.json'), dryOf([['@x/a', 'h-a', 'HIT'], ['@x/b', 'h-b', 'HIT']]))
    assertEquals(await plan(root, ['--dry', 'dry.json']), [])
    const summary = await Deno.readTextFile(join(root, 'github-step-summary'))
    assertStringIncludes(summary, '| @x/a | `h-a` | remote cache hit |')
    assertStringIncludes(summary, '| @x/b | `h-b` | remote cache hit |')
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('one cache miss plans exactly that package; a local hit is not a skip', async () => {
  const root = await workspace('packages:\n  - p/*\n', [['p/a', '@x/a', true], ['p/b', '@x/b', true], [
    'p/c',
    '@x/c',
    true,
  ]])
  try {
    await write(
      join(root, 'dry.json'),
      JSON.stringify({
        tasks: [
          { task: 'test', package: '@x/a', hash: 'h-a', cache: { status: 'HIT', remote: true } },
          { task: 'test', package: '@x/b', hash: 'h-b', cache: { status: 'MISS', remote: false } },
          { task: 'test', package: '@x/c', hash: 'h-c', cache: { status: 'HIT', remote: false, local: true } },
        ],
      }),
    )
    const jobs = await plan(root, ['--dry', 'dry.json'])
    assertEquals(jobs.flatMap((job) => job.packages).sort(), ['@x/b', '@x/c'])
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('a dry run that is not turbo output plans every package', async () => {
  const root = await workspace('packages:\n  - p/*\n', [['p/a', '@x/a', true], ['p/b', '@x/b', true]])
  try {
    await write(join(root, 'dry.json'), 'turbo: error: could not reach the remote cache')
    const jobs = await plan(root, ['--dry', 'dry.json'])
    assertEquals(jobs.flatMap((job) => job.packages).sort(), ['@x/a', '@x/b'])
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

const planned = async (root: string, args: string[]): Promise<void> => {
  const jobs = await plan(root, args)
  await write(join(root, 'plan.json'), JSON.stringify(jobs))
}

Deno.test('a sharded package skips only on the hash all its shards last passed on', async () => {
  const root = await workspace('packages:\n  - p/*\n', [['p/big', '@x/big', true]])
  try {
    await write(
      join(root, 'record.json'),
      JSON.stringify({ version: 2, packages: { '@x/big': { seconds: 900, sha: 's' } } }),
    )
    await write(join(root, 'dry.json'), dryOf([['@x/big', 'h-1', undefined]]))
    await planned(root, ['--dry', 'dry.json', '--record', 'record.json'])
    await Deno.mkdir(join(root, 'parts'))
    for (const i of [1, 2, 3]) {
      await write(
        join(root, `raw-${i}.json`),
        JSON.stringify({ package: '@x/big', shard: `${i}/3`, seconds: '300', exit: '0' }),
      )
      await run(root, ['part', '--job', `big-${i}`, '--raw', `raw-${i}.json`, '--out', `parts/big-${i}.json`])
    }
    await run(root, [
      'merge',
      '--previous',
      'record.json',
      '--parts',
      'parts',
      '--plan',
      'plan.json',
      '--out',
      'next.json',
    ])
    assertEquals(await plan(root, ['--dry', 'dry.json', '--record', 'next.json']), [])
    await write(join(root, 'dry.json'), dryOf([['@x/big', 'h-2', undefined]]))
    assertEquals((await plan(root, ['--dry', 'dry.json', '--record', 'next.json'])).length, 3)
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('a shard set with a failure records no passing hash, and keeps the previous one off', async () => {
  const root = await workspace('packages:\n  - p/*\n', [['p/big', '@x/big', true]])
  try {
    await write(
      join(root, 'record.json'),
      JSON.stringify({ version: 2, packages: { '@x/big': { seconds: 900, sha: 's', passedHash: 'h-0' } } }),
    )
    await write(join(root, 'dry.json'), dryOf([['@x/big', 'h-1', undefined]]))
    await planned(root, ['--dry', 'dry.json', '--record', 'record.json'])
    await Deno.mkdir(join(root, 'parts'))
    for (const [i, code] of [[1, 0], [2, 1], [3, 0]]) {
      await write(
        join(root, `raw-${i}.json`),
        JSON.stringify({ package: '@x/big', shard: `${i}/3`, seconds: '100', exit: String(code) }),
      )
      await run(root, ['part', '--job', `big-${i}`, '--raw', `raw-${i}.json`, '--out', `parts/big-${i}.json`])
    }
    await run(root, [
      'merge',
      '--previous',
      'record.json',
      '--parts',
      'parts',
      '--plan',
      'plan.json',
      '--out',
      'next.json',
    ])
    const next = JSON.parse(await Deno.readTextFile(join(root, 'next.json')))
    assertEquals(next.packages['@x/big'], { seconds: 900, sha: 's' })
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('a package that ran and passed in a packed job skips on its planned hash; a replayed cache hit records nothing', async () => {
  const root = await workspace('packages:\n  - p/*\n', [['p/a', '@x/a', true], ['p/b', '@x/b', true], [
    'p/c',
    '@x/c',
    true,
  ]])
  try {
    await write(
      join(root, 'dry.json'),
      dryOf([['@x/a', 'h-a', undefined], ['@x/b', 'h-b', undefined], ['@x/c', 'h-c', undefined]]),
    )
    await planned(root, ['--dry', 'dry.json'])
    const ran = (pkg: string, exitCode: number) => ({
      task: 'test',
      package: pkg,
      hash: 'only-hash',
      cache: { status: 'MISS' },
      execution: { startTime: 0, endTime: 5000, exitCode },
    })
    const replayed = {
      task: 'test',
      package: '@x/c',
      hash: 'only-hash',
      cache: { status: 'HIT', local: true },
      execution: { startTime: 0, endTime: 10, exitCode: 0 },
    }
    await write(join(root, 'raw.json'), JSON.stringify({ tasks: [ran('@x/a', 0), ran('@x/b', 1), replayed] }))
    await Deno.mkdir(join(root, 'parts'))
    await run(root, ['part', '--job', 'group-1', '--raw', 'raw.json', '--out', 'parts/group-1.json'])
    await run(root, ['merge', '--parts', 'parts', '--plan', 'plan.json', '--out', 'next.json'])
    const jobs = await plan(root, ['--dry', 'dry.json', '--record', 'next.json'])
    assertEquals(jobs.flatMap((job) => job.packages).sort(), ['@x/b', '@x/c'])
    assertStringIncludes(await Deno.readTextFile(join(root, 'github-step-summary')), '| @x/a | `h-a` | recorded pass |')
    await write(
      join(root, 'dry.json'),
      dryOf([['@x/a', 'h-a2', undefined], ['@x/b', 'h-b', undefined], ['@x/c', 'h-c', undefined]]),
    )
    assertEquals(
      (await plan(root, ['--dry', 'dry.json', '--record', 'next.json'])).flatMap((job) => job.packages).sort(),
      [
        '@x/a',
        '@x/b',
        '@x/c',
      ],
    )
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('a turbo run summary converts to a part', async () => {
  const root = await workspace('packages:\n  - p/*\n', [['p/a', '@x/a', true]])
  try {
    await write(
      join(root, 'raw.json'),
      JSON.stringify({
        tasks: [{
          task: 'test',
          package: '@x/a',
          cache: { status: 'MISS' },
          execution: { startTime: 0, endTime: 7000, exitCode: 0 },
        }],
      }),
    )
    await run(root, ['part', '--job', 'group-1', '--raw', 'raw.json', '--out', 'part.json'])
    assertEquals(JSON.parse(await Deno.readTextFile(join(root, 'part.json'))), {
      job: 'group-1',
      entries: [{ package: '@x/a', seconds: 7, exitCode: 0 }],
    })
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})
