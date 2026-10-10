import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'

const here = dirname(fromFileUrl(import.meta.url))
const tool = [
  'run',
  `--config=${join(here, '..', 'deno.jsonc')}`,
  `--lock=${join(here, '..', 'deno.lock')}`,
  '--frozen',
  '--allow-read',
  '--allow-write',
  '--allow-env',
  '--allow-run=timeout',
  join(here, 'mutation-job.ts'),
]

type Position = { readonly line: number; readonly column: number }

type FixtureMutant = {
  readonly id: string
  readonly status: string
  readonly mutatorName: string
  readonly location: { readonly start: Position; readonly end: Position }
  readonly replacement: string
}

const at = (line: number) => ({ start: { line, column: 1 }, end: { line, column: 9 } })

const mutant = (id: string, status: string, line: number): FixtureMutant => ({
  id,
  status,
  mutatorName: 'BooleanLiteral',
  location: at(line),
  replacement: 'false',
})

const reportOf = (files: Record<string, readonly FixtureMutant[]>) => ({
  schemaVersion: '1.0',
  thresholds: { high: 80, low: 60, break: 100 },
  files: Object.fromEntries(
    Object.entries(files).map(([file, mutants]) => [file, { language: 'typescript', source: 'export {}', mutants }]),
  ),
})

type Shard = { readonly index: number; readonly count: number }

/** Stages one part the way `mutation-job run` does, under an artifact directory like download-artifact makes. */
const stage = async (
  root: string,
  dir: string,
  outcome: 'success' | 'failure',
  contents: { readonly report?: unknown; readonly stream?: string; readonly shard?: Shard },
): Promise<void> => {
  const label = contents.shard === undefined ? 'whole' : `${contents.shard.index}of${contents.shard.count}`
  const part = join(root, 'mutation-parts', `mutation-part-${dir.replaceAll('/', '-')}-${label}`, label)
  await Deno.mkdir(part, { recursive: true })
  await Deno.writeTextFile(
    join(part, 'mutation-part.json'),
    JSON.stringify({ package: dir, outcome, ...(contents.shard === undefined ? {} : { shard: contents.shard }) }),
  )
  if (contents.report !== undefined) {
    await Deno.writeTextFile(join(part, 'mutation-report.json'), JSON.stringify(contents.report))
  }
  if (contents.stream !== undefined) await Deno.writeTextFile(join(part, 'mutation-stream.jsonl'), contents.stream)
}

const jobsOf = (dirs: readonly string[]) => JSON.stringify([{ id: 'job-1', packages: dirs, dirs }])

const report = async (root: string, dirs: readonly string[]) => {
  const out = await new Deno.Command(Deno.execPath(), {
    args: [...tool, 'report', '--parts', 'mutation-parts', '--out', 'mutation-merged'],
    cwd: root,
    env: { JOBS: jobsOf(dirs), GITHUB_STEP_SUMMARY: join(root, 'step-summary') },
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  return { code: out.code, stderr: new TextDecoder().decode(out.stderr) }
}

const merged = async (root: string) => ({
  json: JSON.parse(await Deno.readTextFile(join(root, 'mutation-merged', 'mutation.json'))),
  summary: await Deno.readTextFile(join(root, 'mutation-merged', 'summary.md')),
})

const rowOf = (summary: string, label: string): string | undefined =>
  summary.split('\n').find((line) => line.startsWith(`| ${label} |`))

Deno.test('report keys every file by its repo path, so two packages with the same file stay two entries', async () => {
  const root = await Deno.makeTempDir({ prefix: 'mutation-report-' })
  await stage(root, 'packages/a', 'success', {
    report: reportOf({
      'src/index.ts': [mutant('a1', 'Killed', 1), mutant('a2', 'Killed', 2), mutant('a3', 'Killed', 3)],
    }),
  })
  await stage(root, 'packages/b', 'success', {
    report: reportOf({ 'src/index.ts': [mutant('b1', 'Killed', 1), mutant('b2', 'Survived', 7)] }),
  })

  const { code, stderr } = await report(root, ['packages/a', 'packages/b', 'packages/c'])
  assertEquals(code, 0, stderr)
  const { json, summary } = await merged(root)

  assertEquals(Object.keys(json.files).sort(), ['packages/a/src/index.ts', 'packages/b/src/index.ts'])
  assertEquals(json.files['packages/b/src/index.ts'].mutants.map((m: { id: string }) => m.id), ['b1', 'b2'])
  assertEquals(json.schemaVersion, '1.0')
  assertEquals(json.thresholds, { high: 80, low: 60, break: 100 })
  assertEquals(rowOf(summary, 'packages/a'), '| packages/a | 100.00 | 3 | 0 | 0 | 0 | 0 | [OK] |')
  assertEquals(rowOf(summary, 'packages/b'), '| packages/b | 50.00 | 1 | 1 | 0 | 0 | 0 | [FAIL] |')
  assertEquals(rowOf(summary, 'packages/c'), '| packages/c | no report | - | - | - | - | - | [WARN] |')
  assertEquals(rowOf(summary, '**all**'), '| **all** | incomplete | 4 | 1 | 0 | 0 | 0 | [WARN] |')
  assertStringIncludes(summary, '`packages/b/src/index.ts:7:1` Survived `BooleanLiteral` -> `false`')
  assertEquals(await Deno.readTextFile(join(root, 'step-summary')), summary)
})

Deno.test("report folds a package's shards into one and refuses a file two shards both mutated", async () => {
  const root = await Deno.makeTempDir({ prefix: 'mutation-report-' })
  await stage(root, 'packages/a', 'success', {
    shard: { index: 1, count: 2 },
    report: reportOf({ 'src/one.ts': [mutant('o1', 'Killed', 1)] }),
  })
  await stage(root, 'packages/a', 'success', {
    shard: { index: 2, count: 2 },
    report: reportOf({ 'src/two.ts': [mutant('t1', 'Killed', 1)] }),
  })
  assertEquals((await report(root, ['packages/a'])).code, 0)
  const folded = await merged(root)
  assertEquals(Object.keys(folded.json.files).sort(), ['packages/a/src/one.ts', 'packages/a/src/two.ts'])
  assertEquals(rowOf(folded.summary, '**all**'), '| **all** | 100.00 | 2 | 0 | 0 | 0 | 0 | [OK] |')

  const overlap = await Deno.makeTempDir({ prefix: 'mutation-report-' })
  for (const index of [1, 2]) {
    await stage(overlap, 'packages/a', 'success', {
      shard: { index, count: 2 },
      report: reportOf({ 'src/one.ts': [mutant(`o${index}`, 'Killed', 1)] }),
    })
  }
  const refused = await report(overlap, ['packages/a'])
  assertEquals(refused.code, 1)
  assertStringIncludes(refused.stderr, 'both mutated src/one.ts')
})

Deno.test('report refuses a repo path a nested package and its parent both report', async () => {
  const root = await Deno.makeTempDir({ prefix: 'mutation-report-' })
  await stage(root, 'packages/a', 'success', { report: reportOf({ 'b/x.ts': [mutant('p1', 'Killed', 1)] }) })
  await stage(root, 'packages/a/b', 'success', { report: reportOf({ 'x.ts': [mutant('n1', 'Killed', 1)] }) })
  const refused = await report(root, ['packages/a', 'packages/a/b'])
  assertEquals(refused.code, 1)
  assertStringIncludes(refused.stderr, 'packages/a/b/x.ts is reported by both packages/a and packages/a/b')
})

Deno.test('report keeps the verdicts a shard that stopped early streamed, and marks its package incomplete', async () => {
  const root = await Deno.makeTempDir({ prefix: 'mutation-report-' })
  const line = (id: string, status: string) =>
    JSON.stringify({
      _tag: 'mutant',
      id,
      status,
      file: 'src/slow.ts',
      location: at(4),
      mutator: 'ConditionalExpression',
      replacement: 'true',
      completed: 1,
      total: 9,
      static: false,
      cost: null,
    })
  await stage(root, 'packages/a', 'failure', {
    stream: [
      JSON.stringify({ _tag: 'phase', phase: 'mutation-test' }),
      line('s1', 'Killed'),
      line('s2', 'Survived'),
      '',
    ]
      .join('\n'),
  })

  const { code, stderr } = await report(root, ['packages/a'])
  assertEquals(code, 0, stderr)
  const { json, summary } = await merged(root)
  assertEquals(json.files['packages/a/src/slow.ts'].mutants.map((m: { status: string }) => m.status), [
    'Killed',
    'Survived',
  ])
  assertEquals(rowOf(summary, 'packages/a'), '| packages/a | incomplete | 1 | 1 | 0 | 0 | 0 | [FAIL] |')
  assert(summary.includes('`packages/a/src/slow.ts:4:1` Survived'))
})

Deno.test('report fails when no job staged a part', async () => {
  const root = await Deno.makeTempDir({ prefix: 'mutation-report-' })
  await Deno.mkdir(join(root, 'mutation-parts'))
  const refused = await report(root, ['packages/a'])
  assertEquals(refused.code, 1)
  assertStringIncludes(refused.stderr, 'no mutation report parts were staged for the planned packages: packages/a')
})
