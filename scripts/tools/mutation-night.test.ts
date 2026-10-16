import { assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import {
  conclusionOf,
  type Item,
  keyOf,
  packagesDecisionOf,
  priorOf,
  rangeStartOf,
  routeOf,
  survivorsOf,
  verdictOf,
} from './mutation-night.ts'

const here = dirname(fromFileUrl(import.meta.url))

const ENROLLED = [
  { label: 'packages/discern', name: '@systemfsoftware/discern' },
  { label: 'packages/effect-memfs', name: '@systemfsoftware/effect-memfs' },
]

Deno.test('an unset packages input plans every enrolled package', () => {
  assertEquals(packagesDecisionOf(ENROLLED, ''), { _tag: 'All' })
})

Deno.test('a packages input naming enrolled packages plans exactly those', () => {
  assertEquals(packagesDecisionOf(ENROLLED, '["@systemfsoftware/effect-memfs"]'), {
    _tag: 'Named',
    rows: [ENROLLED[1]],
  })
})

Deno.test('a packages input that is not a non-empty array of enrolled names refuses the plan', () => {
  for (const raw of ['[]', '{}', '"@systemfsoftware/discern"', '[1]', 'discern', '["@systemfsoftware/discren"]']) {
    assertEquals(packagesDecisionOf(ENROLLED, raw)._tag, 'Refused', raw)
  }
})

const SURVIVOR: Item = {
  _tag: 'Survivor',
  label: 'packages/discern',
  id: '0c0d7a2634866b46',
  at: 'packages/discern/src/a.workflow.ts:36',
  mutator: 'ConditionalExpression',
  reproduce: 'gh workflow run Mutation',
}
const FAILURE: Item = { _tag: 'Failure', job: 'shard', reason: 'timed-out', message: 'concluded cancelled' }

Deno.test('a night is green only when it ended success and reported every planned package with nothing to name', () => {
  const planned = ['packages/discern', 'packages/effect-memfs']
  assertEquals(verdictOf('success', planned, planned, []), 'green')
  assertEquals(verdictOf('success', planned, ['packages/discern'], []), 'red')
  assertEquals(verdictOf('success', planned, planned, [SURVIVOR]), 'red')
  assertEquals(verdictOf('cancelled', planned, planned, []), 'red')
})

Deno.test('a run with a cancelled or timed-out job concludes cancelled, else failure, else success', () => {
  assertEquals(conclusionOf(['success', 'skipped', 'success']), 'success')
  assertEquals(conclusionOf(['success', 'failure']), 'failure')
  assertEquals(conclusionOf(['failure', 'cancelled']), 'cancelled')
})

Deno.test('survivors are the Survived and NoCoverage mutants of a merged report', () => {
  const report = {
    files: {
      'packages/discern/src/a.workflow.ts': {
        mutants: [
          { id: 'a1', status: 'Survived', mutatorName: 'StringLiteral', location: { start: { line: 3 } } },
          { id: 'a2', status: 'NoCoverage', mutatorName: 'BlockStatement', location: { start: { line: 9 } } },
          { id: 'a3', status: 'Killed', mutatorName: 'StringLiteral', location: { start: { line: 4 } } },
        ],
      },
    },
  }
  assertEquals(survivorsOf('packages/discern', report, 'r').map((item) => keyOf(item)), [
    'survivor packages/discern a1',
    'survivor packages/discern a2',
  ])
})

Deno.test('a range starts at the last green night, else the previous scheduled night, else nowhere', () => {
  const all = () => true
  assertEquals(rangeStartOf('green', 'previous', all), 'green')
  assertEquals(rangeStartOf(null, 'previous', all), 'previous')
  assertEquals(rangeStartOf('green', 'previous', (sha) => sha !== 'green'), 'previous')
  assertEquals(rangeStartOf(null, null, all), null)
})

Deno.test('a stored record reads as its verdict and open tasks, and any other shape as no record', () => {
  assertEquals(priorOf({ verdict: 'red', tasks: [{ pr: 7, keys: ['a', 1] }, { pr: '8', keys: [] }] }), {
    verdict: 'red',
    tasks: [{ pr: 7, keys: ['a'] }],
  })
  assertEquals(priorOf({ verdict: 'amber', tasks: [] }), null)
  assertEquals(priorOf([]), null)
})

const CANDIDATES = [
  { sha: 'aaaaaaaaaaaa', pr: 101, author: 'ada' },
  { sha: 'bbbbbbbbbbbb', pr: null, author: null },
  { sha: 'cccccccccccc', pr: 102, author: 'bob' },
]

Deno.test('a red night carries its report in one comment on the newest candidate merge, and the summary holds it', () => {
  const { tasks, comments, summary } = routeOf('run', 'a..b', [], [SURVIVOR, FAILURE], CANDIDATES)
  assertEquals(tasks, [{ pr: 101, keys: [keyOf(SURVIVOR), keyOf(FAILURE)] }])
  assertEquals(comments.length, 1)
  assertEquals(comments[0]!.pr, 101)
  for (const text of [comments[0]!.body, summary.join('\n')]) {
    assertStringIncludes(text, '@ada @bob')
    assertStringIncludes(text, SURVIVOR.id)
    assertStringIncludes(text, 'Mutation night run (a..b) is red.')
  }
})

Deno.test('a red night skips a candidate without a pull request and comments on the newest one that has one', () => {
  const candidates = [
    { sha: 'dddddddddddd', pr: null, author: null },
    { sha: 'eeeeeeeeeeee', pr: 102, author: 'bob' },
  ]
  const { tasks, comments } = routeOf('run', 'a..b', [], [SURVIVOR], candidates)
  assertEquals(tasks, [{ pr: 102, keys: [keyOf(SURVIVOR)] }])
  assertEquals(comments.map((comment) => comment.pr), [102])
})

Deno.test('a red night does not update a task a previous night filed on another pull request', () => {
  const { tasks, comments } = routeOf('run', 'a..b', [{ pr: 90, keys: [keyOf(SURVIVOR)] }], [SURVIVOR], CANDIDATES)
  assertEquals(tasks, [{ pr: 101, keys: [keyOf(SURVIVOR)] }])
  assertEquals(comments.map((comment) => comment.pr), [101])
})

Deno.test('a red night files no comment when no candidate merge has a pull request, so the CLI refuses unrouted', () => {
  const candidates = [{ sha: 'ffffffffffff', pr: null, author: null }]
  const { tasks, comments, summary } = routeOf('run', 'a..b', [], [SURVIVOR], candidates)
  assertEquals(tasks, [])
  assertEquals(comments, [])
  assertStringIncludes(summary.join('\n'), SURVIVOR.id)
})

Deno.test('a green night closes the one open task and files none', () => {
  const { tasks, comments } = routeOf('run', 'a..b', [{ pr: 90, keys: [keyOf(FAILURE)] }], [], [])
  assertEquals(tasks, [])
  assertEquals(comments.map((comment) => comment.pr), [90])
  assertStringIncludes(comments[0]!.body, 'no longer shows')
})

const git = async (cwd: string, ...args: string[]): Promise<string> => {
  const out = await new Deno.Command('git', {
    args: ['-c', 'user.name=t', '-c', 'user.email=t@invalid', '-c', 'commit.gpgsign=false', ...args],
    cwd,
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  if (!out.success) throw new Error(new TextDecoder().decode(out.stderr))
  return new TextDecoder().decode(out.stdout).trim()
}

const guard = async (cwd: string, temp: string, ...args: string[]) => {
  const out = await new Deno.Command(Deno.execPath(), {
    args: [
      'run',
      `--config=${join(here, '..', 'deno.jsonc')}`,
      `--lock=${join(here, '..', 'deno.lock')}`,
      '--frozen',
      '--allow-read',
      '--allow-env',
      `--allow-write=${temp}`,
      '--allow-run=git',
      join(here, 'mutation-night.ts'),
      'guard',
      ...args,
    ],
    cwd,
    env: { RUNNER_TEMP: temp },
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  return { code: out.code, stdout: new TextDecoder().decode(out.stdout) }
}

Deno.test('the guard refuses a ref off the default branch, a sha off its tip and an option-shaped sha', async () => {
  const root = await Deno.makeTempDir()
  try {
    const origin = join(root, 'origin')
    await Deno.mkdir(origin)
    await git(origin, 'init', '-q', '-b', 'main')
    await git(origin, 'commit', '-q', '--allow-empty', '-m', 'one')
    const onMain = await git(origin, 'rev-parse', 'HEAD')
    await git(origin, 'checkout', '-q', '-b', 'topic')
    await git(origin, 'commit', '-q', '--allow-empty', '-m', 'two')
    const offMain = await git(origin, 'rev-parse', 'HEAD')
    await git(root, 'clone', '-q', origin, 'clone')
    const clone = join(root, 'clone')

    assertEquals((await guard(clone, root, '--ref', 'main', '--default', 'main')).code, 0)
    assertEquals((await guard(clone, root, '--ref', 'main', '--default', 'main', '--sha', onMain)).code, 0)

    const offRef = await guard(clone, root, '--ref', 'topic', '--default', 'main')
    assertEquals(offRef.code, 1)
    assertStringIncludes(offRef.stdout, 'title=mutation-off-main')
    assertEquals(await Deno.readTextFile(join(root, 'sfs-reason')), 'mutation-off-main\n')

    for (const sha of [offMain, '--all', '-q']) {
      const refused = await guard(clone, root, '--ref', 'main', '--default', 'main', `--sha=${sha}`)
      assertEquals(refused.code, 1, sha)
      assertStringIncludes(refused.stdout, 'title=mutation-sha-off-main')
    }
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})
