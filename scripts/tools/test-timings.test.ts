import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { admitMutation, annotationOf, type ProbeFacts, secondsPerMutant } from './mutation-plan.ts'
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

const exec = (cwd: string, args: string[], extra: Readonly<Record<string, string>> = {}) => {
  const env = {
    GITHUB_OUTPUT: join(cwd, 'github-output'),
    GITHUB_STEP_SUMMARY: join(cwd, 'github-step-summary'),
    ...extra,
  }
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
      JSON.stringify({
        version: 2,
        packages: { '@x/big': { seconds: 900, mutants: 120, sha: 's', passedHash: 'h-0' } },
      }),
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
    assertEquals(next.packages['@x/big'], { seconds: 900, mutants: 120, sha: 's' })
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

const passRecord = (packages: Record<string, string>) =>
  JSON.stringify({
    version: 2,
    packages: Object.fromEntries(
      Object.entries(packages).map(([name, hash]) => [name, { seconds: 30, sha: 's', passedHash: hash }]),
    ),
  })

Deno.test('a pass recorded on another ref skips the package; a pass for another hash does not', async () => {
  const root = await workspace('packages:\n  - p/*\n', [['p/a', '@x/a', true], ['p/b', '@x/b', true]])
  try {
    await write(join(root, 'dry.json'), dryOf([['@x/a', 'h-a', undefined], ['@x/b', 'h-b', undefined]]))
    await Deno.mkdir(join(root, 'passes', '7'), { recursive: true })
    await Deno.mkdir(join(root, 'passes', '8'), { recursive: true })
    await write(join(root, 'passes', '7', 'test-timings.json'), passRecord({ '@x/a': 'h-a', '@x/b': 'h-b-old' }))
    await write(join(root, 'passes', '8', 'test-timings.json'), passRecord({ '@x/b': 'h-b-other' }))
    const jobs = await plan(root, ['--dry', 'dry.json', '--passes', 'passes'])
    assertEquals(jobs.flatMap((job) => job.packages).sort(), ['@x/b'])
    assertStringIncludes(await Deno.readTextFile(join(root, 'github-step-summary')), '| @x/a | `h-a` | recorded pass |')
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('with no pass records to read, as when the listing fails, every package is planned', async () => {
  const root = await workspace('packages:\n  - p/*\n', [['p/a', '@x/a', true], ['p/b', '@x/b', true]])
  try {
    await write(join(root, 'listing.json'), '{"message":"Bad credentials"')
    const out = await exec(root, ['recent', '--listing', 'listing.json'])
    assertEquals([out.code === 0, new TextDecoder().decode(out.stdout).trim()], [false, ''])
    await write(join(root, 'dry.json'), dryOf([['@x/a', 'h-a', undefined], ['@x/b', 'h-b', undefined]]))
    const jobs = await plan(root, ['--dry', 'dry.json', '--passes', 'passes'])
    assertEquals(jobs.flatMap((job) => job.packages).sort(), ['@x/a', '@x/b'])
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('recent lists live records newest first across every ref, up to --count', async () => {
  const root = await workspace('packages:\n  - p/*\n', [['p/a', '@x/a', true]])
  try {
    const at = (id: number, created: string, branch: string, expired = false) => ({
      id,
      expired,
      created_at: created,
      workflow_run: { head_branch: branch },
    })
    await write(
      join(root, 'listing.json'),
      JSON.stringify([{
        artifacts: [
          at(1, '2026-10-08T01:00:00Z', 'main'),
          at(2, '2026-10-08T03:00:00Z', 'feature'),
          at(3, '2026-10-08T04:00:00Z', 'queue/x', true),
          at(4, '2026-10-08T02:00:00Z', 'other'),
        ],
      }]),
    )
    const out = await exec(root, ['recent', '--listing', 'listing.json', '--count', '2'])
    assertEquals(new TextDecoder().decode(out.stdout).trim().split('\n'), ['2', '4'])
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

const strykerConfigPackage = join(here, '..', '..', 'packages', 'toolchain', 'stryker-config')

const INHERITED_CONFIG = [
  "import { sharedConfig } from '@systemfsoftware/stryker-config'",
  'export default { ...sharedConfig }',
  '',
].join('\n')

type MutationPackage = {
  readonly scripts?: Readonly<Record<string, string>>
  readonly files: Readonly<Record<string, string>>
}

/** A workspace whose packages each link the real `@systemfsoftware/stryker-config`, as an install would. */
const mutationWorkspace = async (pkgs: Readonly<Record<string, MutationPackage>>): Promise<string> => {
  const root = await Deno.makeTempDir({ prefix: 'mutation-workspace-' })
  await write(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - p/*\n')
  await write(join(root, 'package.json'), JSON.stringify({ name: 'root', private: true }))
  for (const [name, pkg] of Object.entries(pkgs)) {
    const dir = join(root, 'p', name.replace(/^@x\//, ''))
    const scripts = pkg.scripts ?? { mutation: 'stryker run' }
    await write(join(dir, 'package.json'), JSON.stringify({ name, type: 'module', scripts }))
    await Deno.mkdir(join(dir, 'node_modules', '@systemfsoftware'), { recursive: true })
    await Deno.symlink(strykerConfigPackage, join(dir, 'node_modules', '@systemfsoftware', 'stryker-config'))
    for (const [file, text] of Object.entries(pkg.files)) await write(join(dir, file), text)
  }
  return root
}

const WORKFLOW = 'export const decide = (n: number) => (n > 0 ? 1 : 0)\n'

/** A package whose config mutates all of `src/` when `condition` holds, and inherits the shared set otherwise. */
const gatedOn = (condition: string): Record<string, string> => ({
  'src/decide.workflow.ts': WORKFLOW,
  'src/helper.ts': 'export const helper = 1\n',
  'stryker.config.ts': [
    "import { sharedConfig } from '@systemfsoftware/stryker-config'",
    `export default { ...sharedConfig, mutate: ${condition} ? ['src/**/*.ts'] : sharedConfig.mutate }`,
    '',
  ].join('\n'),
})

Deno.test('the mutation plan refuses, before Stryker runs, every package that widens or replaces the shared mutated set', async () => {
  const root = await mutationWorkspace({
    '@x/clean': { files: { 'src/decide.workflow.ts': WORKFLOW, 'stryker.config.ts': INHERITED_CONFIG } },
    '@x/own': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'src/shape.schema.ts': 'export const shape = 1\n',
        'src/__tests__/decide.test.ts': 'export {}\n',
        'stryker.config.ts': [
          "import { sharedConfig } from '@systemfsoftware/stryker-config'",
          "export default { ...sharedConfig, mutate: ['src/**/*.ts'] }",
          '',
        ].join('\n'),
      },
    },
    '@x/script': {
      scripts: { mutation: 'stryker run --mutate src/decide.workflow.ts' },
      files: { 'src/decide.workflow.ts': WORKFLOW, 'stryker.config.ts': INHERITED_CONFIG },
    },
    '@x/full': {
      scripts: { mutation: 'stryker run', 'mutation:full': 'stryker run --force' },
      files: { 'src/decide.workflow.ts': WORKFLOW, 'stryker.config.ts': INHERITED_CONFIG },
    },
    '@x/fullonly': {
      scripts: { 'mutation:full': 'stryker run --force' },
      files: { 'src/decide.workflow.ts': WORKFLOW, 'stryker.config.ts': INHERITED_CONFIG },
    },
    '@x/ci-gated': { files: gatedOn("process.env['CI']") },
    '@x/shard-gated': { files: gatedOn("process.env['STRYKER_SHARD']") },
    '@x/whole-gated': { files: gatedOn("!process.env['STRYKER_SHARD']") },
    '@x/output-gated': { files: gatedOn("process.env['GITHUB_OUTPUT'] !== undefined") },
    '@x/bare': { files: { 'src/decide.ts': WORKFLOW, 'stryker.config.ts': INHERITED_CONFIG } },
    '@x/broken': {
      files: { 'src/decide.workflow.ts': WORKFLOW, 'stryker.config.ts': "throw new Error('no config today')\n" },
    },
    '@x/shadow': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'src/helper.ts': 'export const helper = 1\n',
        'stryker.config.ts': INHERITED_CONFIG,
        'stryker.conf.ts': [
          "import { sharedConfig } from '@systemfsoftware/stryker-config'",
          "export default { ...sharedConfig, mutate: ['src/**/*.workflow.ts', 'src/helper.ts'] }",
          '',
        ].join('\n'),
      },
    },
    '@x/pushed': {
      files: {
        'src/decide.workflow.ts': WORKFLOW,
        'src/helper.ts': 'export const helper = 1\n',
        'stryker.config.ts': [
          "import { sharedConfig } from '@systemfsoftware/stryker-config'",
          "sharedConfig.mutate.push('src/helper.ts')",
          'export default { ...sharedConfig }',
          '',
        ].join('\n'),
      },
    },
    '@x/unenrolled': { scripts: {}, files: { 'src/decide.workflow.ts': WORKFLOW } },
    '@x/unenrolled-tests': { scripts: {}, files: { 'src/__tests__/decide.workflow.ts': WORKFLOW } },
    // The shared set is what Node's glob gives the probe: it follows a symlink and skips a dot directory.
    '@x/unenrolled-linked': { scripts: {}, files: { 'lib/decide.ts': WORKFLOW } },
    '@x/unenrolled-dotted': { scripts: {}, files: { 'src/.generated/decide.workflow.ts': WORKFLOW } },
  })
  await Deno.mkdir(join(root, 'p', 'unenrolled-linked', 'src'))
  await Deno.symlink('../lib/decide.ts', join(root, 'p', 'unenrolled-linked', 'src', 'decide.workflow.ts'))
  try {
    // A Mutation job has CI set, STRYKER_SHARD defined and the file-command paths: the plan judges each config there.
    const out = await exec(root, ['plan', '--task', 'mutation', '--target', '900', '--unknown-mutant-seconds', '21'], {
      CI: 'true',
    })
    const stderr = new TextDecoder().decode(out.stderr)
    assertEquals(out.code === 0, false, stderr)
    const refused = stderr.split('\n').filter((line) => line.startsWith('::error title='))
      .map((line) => /^::error title=([a-z-]+)::(\S+?):/.exec(line)?.slice(1, 3).join(' ') ?? line).sort()
    assertEquals(refused, [
      'config-unloadable @x/broken',
      'missing-mutation-script @x/unenrolled',
      'missing-mutation-script @x/unenrolled-linked',
      'mutation-script @x/full',
      'mutation-script @x/fullonly',
      'mutation-script @x/script',
      'no-workflow-file @x/bare',
      'non-workflow-target @x/ci-gated',
      'non-workflow-target @x/output-gated',
      'non-workflow-target @x/own',
      'non-workflow-target @x/pushed',
      'non-workflow-target @x/shadow',
      'non-workflow-target @x/shard-gated',
      'non-workflow-target @x/whole-gated',
      'own-mutate-targets @x/ci-gated',
      'own-mutate-targets @x/output-gated',
      'own-mutate-targets @x/own',
      'own-mutate-targets @x/pushed',
      'own-mutate-targets @x/shadow',
      'own-mutate-targets @x/shard-gated',
      'own-mutate-targets @x/whole-gated',
      'test-file-target @x/own',
    ])
    const unenrolled = stderr.split('\n').find((line) =>
      line.startsWith('::error title=missing-mutation-script::@x/unenrolled:')
    )
    assertStringIncludes(unenrolled ?? '', 'src/decide.workflow.ts')
    const shardGated = stderr.split('\n').find((line) =>
      line.startsWith('::error title=own-mutate-targets::@x/shard-gated:')
    )
    assertStringIncludes(shardGated ?? '', "when STRYKER_SHARD is '1/1';")
    const wholeGated = stderr.split('\n').find((line) =>
      line.startsWith('::error title=own-mutate-targets::@x/whole-gated:')
    )
    assertStringIncludes(wholeGated ?? '', "when STRYKER_SHARD is '';")
    const own = stderr.split('\n').filter((line) => line.startsWith('::error title=') && line.includes('@x/own:'))
    assertStringIncludes(own.find((line) => line.includes('non-workflow-target')) ?? '', 'src/shape.schema.ts')
    assertStringIncludes(own.find((line) => line.includes('test-file-target')) ?? '', 'src/__tests__/decide.test.ts')
    const shadow = stderr.split('\n').find((line) => line.startsWith('::error title=') && line.includes('@x/shadow:'))
    assertStringIncludes(shadow ?? '', 'stryker.conf.ts')
    assertEquals(await readOrEmpty(join(root, 'github-output')), '')
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

/** A `stryker` on the package's PATH that writes a contract-shaped shard plan holding `mutants` mutants. */
const fakeStryker = (mutants: number): string =>
  [
    '#!/bin/sh',
    'out=""',
    'while [ $# -gt 0 ]; do [ "$1" = --out ] && out="$2"; shift; done',
    `ids=$(seq 1 ${mutants} | sed 's/.*/"m&"/' | paste -sd, -)`,
    'printf \'{"version":1,"targetSeconds":900,"shards":[{"index":1,"count":1,"predictedSeconds":1,' +
    '"projects":[{"project":".","mutants":[%s]}]}],"matrix":{"include":[]}}\' "$ids" > "$out"',
    '',
  ].join('\n')

Deno.test('the mutation plan sizes shards from the mutants Stryker plans and the measured seconds per mutant', async () => {
  const root = await mutationWorkspace({
    '@x/big': { files: { 'src/decide.workflow.ts': WORKFLOW, 'stryker.config.ts': INHERITED_CONFIG } },
    '@x/small': { files: { 'src/decide.workflow.ts': WORKFLOW, 'stryker.config.ts': INHERITED_CONFIG } },
  })
  try {
    for (const [dir, mutants] of [['big', 400], ['small', 10]] as const) {
      await write(join(root, 'p', dir, 'node_modules', '.bin', 'stryker'), fakeStryker(mutants))
      await Deno.chmod(join(root, 'p', dir, 'node_modules', '.bin', 'stryker'), 0o755)
    }
    // 1,800 s over 200 mutants is 9 s a mutant: @x/big's 400 mutants predict 3,600 s, four 900 s shards;
    // @x/small has no rate of its own and takes the slowest recorded one, 10 mutants at 9 s.
    await write(
      join(root, 'record.json'),
      JSON.stringify({
        version: 2,
        packages: {
          '@x/big': { seconds: 1800, mutants: 200, sha: 's' },
          '@x/gone': { seconds: 300, mutants: 100, sha: 's' },
        },
      }),
    )
    await Deno.remove(join(root, 'github-output')).catch(() => {})
    await run(root, [
      'plan',
      '--task',
      'mutation',
      '--target',
      '900',
      '--max-jobs',
      '8',
      '--unknown-mutant-seconds',
      '21',
      '--record',
      'record.json',
    ])
    const line = (await Deno.readTextFile(join(root, 'github-output'))).trim()
    const jobs = JSON.parse(line.slice('jobs='.length)) as (Job & {
      predicted: number
      mutants: Record<string, number>
      shard?: { index: number; count: number }
    })[]
    assertEquals(
      jobs.map((job) => [job.packages.join(','), job.shard?.count ?? 1, job.predicted, job.mutants]),
      [
        ['@x/big', 4, 900, { '@x/big': 400 }],
        ['@x/big', 4, 900, { '@x/big': 400 }],
        ['@x/big', 4, 900, { '@x/big': 400 }],
        ['@x/big', 4, 900, { '@x/big': 400 }],
        ['@x/small', 1, 90, { '@x/small': 10 }],
      ],
    )

    await write(join(root, 'plan.json'), JSON.stringify(jobs))
    await Deno.mkdir(join(root, 'parts'))
    for (const index of [1, 2, 3, 4]) {
      await run(root, [
        'part',
        '--job',
        `big-${index}`,
        '--package',
        '@x/big',
        '--shard',
        `${index}/4`,
        '--seconds',
        '700',
        '--exit',
        '0',
        '--out',
        join(root, 'parts', `big-${index}.json`),
      ])
    }
    await run(root, ['merge', '--task', 'mutation', '--parts', 'parts', '--plan', 'plan.json', '--out', 'next.json'])
    const next = JSON.parse(await Deno.readTextFile(join(root, 'next.json'))) as TimingRecordShape
    assertEquals([next.packages['@x/big']?.seconds, next.packages['@x/big']?.mutants], [2800, 400])
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('the mutation plan fails naming the package when stryker plan fails or writes no version 1 shard plan', async () => {
  const root = await mutationWorkspace({
    '@x/a': { files: { 'src/decide.workflow.ts': WORKFLOW, 'stryker.config.ts': INHERITED_CONFIG } },
  })
  const bin = join(root, 'p', 'a', 'node_modules', '.bin', 'stryker')
  try {
    const cases: readonly (readonly [string, string])[] = [
      ['#!/bin/sh\necho "instrumenter crashed" >&2\nexit 1\n', '@x/a: stryker plan exited 1: instrumenter crashed'],
      [
        '#!/bin/sh\nwhile [ $# -gt 0 ]; do [ "$1" = --out ] && out="$2"; shift; done\necho \'{"version":2}\' > "$out"\n',
        '@x/a: stryker plan wrote no version 1 shard plan',
      ],
    ]
    for (const [script, reason] of cases) {
      await write(bin, script)
      await Deno.chmod(bin, 0o755)
      const out = await exec(root, ['plan', '--task', 'mutation', '--target', '900', '--unknown-mutant-seconds', '21'])
      const stderr = new TextDecoder().decode(out.stderr)
      assertEquals(out.code === 0, false, stderr)
      assertStringIncludes(stderr, reason)
      assertEquals(await readOrEmpty(join(root, 'github-output')), '')
    }
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

type TimingRecordShape = { packages: Record<string, { seconds: number; mutants?: number }> }

Deno.test('a mutant takes its own recorded rate, else the slowest recorded rate, else --unknown-mutant-seconds', () => {
  const measured = (seconds: number, mutants?: number) => ({
    seconds,
    sha: 's',
    ...(mutants === undefined ? {} : { mutants }),
  })
  const cases = [
    // 1,800 s over 200 mutants
    [{ '@x/a': measured(1800, 200), '@x/b': measured(100, 50) }, '@x/a', { seconds: 9, source: 'own' }],
    // @x/c has none: the slower of 1,800/200 = 9 and 100/50 = 2
    [{ '@x/a': measured(1800, 200), '@x/b': measured(100, 50) }, '@x/c', { seconds: 9, source: 'slowest recorded' }],
    // an entry without mutants, or with 0, gives no rate, its own or anyone's
    [{ '@x/a': measured(1800), '@x/b': measured(100, 50) }, '@x/a', { seconds: 2, source: 'slowest recorded' }],
    [{ '@x/a': measured(1800, 0) }, '@x/a', { seconds: 21, source: 'unknown-mutant-seconds' }],
    [{}, '@x/a', { seconds: 21, source: 'unknown-mutant-seconds' }],
  ] as const
  for (const [packages, name, expected] of cases) {
    assertEquals(
      secondsPerMutant({ version: 2, packages }, name, 21),
      expected,
      `${name} in ${JSON.stringify(packages)}`,
    )
  }
})

Deno.test('a config refused differently under each STRYKER_SHARD reports both, and a shared refusal once', () => {
  const shared = { patterns: ['src/**/*.workflow.ts', '!src/**/__tests__/**'], files: ['src/d.workflow.ts'] }
  const widened = (files: string[]): ProbeFacts => ({
    config: 'stryker.config.ts',
    shared,
    own: { patterns: files, extends: null, files },
    error: null,
  })
  const unloadable: ProbeFacts = {
    config: 'stryker.config.ts',
    shared: null,
    own: null,
    error: 'no config when sharded',
  }
  const annotations = admitMutation([
    {
      name: '@x/mixed',
      dir: 'p/mixed',
      scripts: { mutation: 'stryker run' },
      probes: { '': widened(['src/a.ts']), '1/1': unloadable },
    },
    {
      name: '@x/same',
      dir: 'p/same',
      scripts: { mutation: 'stryker run' },
      probes: { '': widened(['src/a.ts']), '1/1': widened(['src/a.ts']) },
    },
  ], []).refusals.map(annotationOf)
  assertEquals(annotations.map((line) => /^::error title=([a-z-]+)::(\S+?):/.exec(line)?.slice(1, 3).join(' ')), [
    'own-mutate-targets @x/mixed',
    'non-workflow-target @x/mixed',
    'config-unloadable @x/mixed',
    'own-mutate-targets @x/same',
    'non-workflow-target @x/same',
  ])
  assertEquals(annotations[1]?.endsWith("src/a.ts when STRYKER_SHARD is ''"), true, annotations[1])
  assertStringIncludes(annotations[2] ?? '', "no config when sharded (when STRYKER_SHARD is '1/1')")
  assertStringIncludes(annotations[3] ?? '', "when STRYKER_SHARD is '' or '1/1';")
  assertEquals(annotations[4]?.endsWith("src/a.ts when STRYKER_SHARD is '' or '1/1'"), true, annotations[4])
})
