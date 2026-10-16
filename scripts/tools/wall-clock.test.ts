import { assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { decide, formatDuration, formatWarning, type JobRecord, type RecordFile, renderSummary } from './wall-clock.ts'

const here = dirname(fromFileUrl(import.meta.url))

const CALL = 'ci-checks-1a2b3c4d'
const full = { event: 'pull_request', scope: 'full', attempt: 1 } as const

const artifact = (job: string, attempt = 1): string => `job-record-${CALL}-${job}-a${attempt}`
const file = (name: string, text: string): RecordFile => ({ artifact: name, text })

const record = (over: Partial<JobRecord> = {}): string =>
  JSON.stringify({
    version: 1,
    call: CALL,
    group: 'test',
    job: 'test-3',
    name: 'test · x',
    attempt: 1,
    start: 1_000,
    end: 1_660,
    outcome: 'success',
    reason: null,
    ...over,
  })

Deno.test('an 11-minute pull request job warns once and its row still shows success', () => {
  const decision = decide([file(artifact('test-3'), record())], full)
  assertEquals(decision.rows, [
    { job: 'test-3', name: 'test · x', outcome: 'success', wall: '11:00', reason: '', budget: '600s (over)' },
  ])
  assertEquals(decision.warnings, [
    { code: 'wall-clock-over-budget', text: 'job test-3 (test · x) wall 11:00, budget 10:00' },
  ])
})

Deno.test('exactly 10:00 is not over', () => {
  const decision = decide([file(artifact('test-3'), record({ end: 1_600 }))], full)
  assertEquals(decision.warnings, [])
  assertEquals(decision.rows[0].budget, '600s')
})

Deno.test('a docs-only call budgets 3:00 per job, a full or unscoped call 10:00', () => {
  const files = [file(artifact('test-3'), record({ start: 1_000, end: 1_181 }))]
  const docsOnly = decide(files, { event: 'pull_request', scope: 'docs-only', attempt: 1 })
  assertEquals(docsOnly.warnings, [
    { code: 'wall-clock-over-budget', text: 'job test-3 (test · x) wall 3:01, budget 3:00' },
  ])
  assertEquals(docsOnly.rows[0].budget, '180s (over)')
  assertEquals(decide(files, { event: 'pull_request', scope: 'code', attempt: 1 }).warnings, [])
  assertEquals(decide(files, { event: 'pull_request', scope: '', attempt: 1 }).warnings, [])
})

Deno.test('jobs each under budget that span 10:30 give one call-level warning', () => {
  const decision = decide([
    file(artifact('test-1'), record({ job: 'test-1', name: 'test · one', start: 0, end: 300 })),
    file(artifact('test-2'), record({ job: 'test-2', name: 'test · two', start: 330, end: 630 })),
  ], full)
  assertEquals(decision.rows.length, 2)
  assertEquals(decision.warnings, [
    { code: 'wall-clock-over-budget', text: `call ${CALL} wall 10:30, budget 10:00` },
  ])
})

Deno.test('a 45-minute postsubmit job gets a row and no budget warning', () => {
  const forEvents = ['push', 'merge_group', 'workflow_dispatch', 'schedule']
  for (const event of forEvents) {
    const decision = decide([file(artifact('test-3'), record({ start: 0, end: 2_700 }))], {
      event,
      scope: 'full',
      attempt: 1,
    })
    assertEquals(decision.rows, [
      { job: 'test-3', name: 'test · x', outcome: 'success', wall: '45:00', reason: '', budget: '' },
    ], `${event} still gets a row`)
    assertEquals(decision.warnings, [], `${event} carries no budget flag`)
  }
})

Deno.test('a malformed record warns by artifact name and the other records still get rows', () => {
  const broken = 'job-record-ci-checks-1a2b3c4d-broken-a1'
  const decision = decide([
    file(broken, '{not json'),
    file(artifact('test-3'), record({ start: 1_000, end: 1_100 })),
  ], full)
  assertEquals(decision.rows.length, 1)
  assertEquals(decision.warnings, [
    { code: 'wall-clock-record-malformed', text: `artifact ${broken}: the record is not JSON` },
  ])
})

Deno.test('a record missing a field, or empty, is malformed too', () => {
  const withoutEnd = JSON.stringify({
    version: 1,
    call: CALL,
    group: 'test',
    job: 'test-3',
    name: 'test · x',
    attempt: 1,
    start: 1_000,
    outcome: 'success',
    reason: null,
  })
  assertEquals(decide([file(artifact('test-3'), withoutEnd)], full), {
    rows: [],
    warnings: [{
      code: 'wall-clock-record-malformed',
      text: `artifact ${artifact('test-3')}: end is not a number`,
    }],
  })
  assertEquals(decide([file(artifact('test-3'), '')], full).warnings, [
    { code: 'wall-clock-record-malformed', text: `artifact ${artifact('test-3')}: the record is empty` },
  ])
})

Deno.test('at attempt 2 the attempt-1 records are ignored with a warning, and only attempt-2 rows survive', () => {
  const decision = decide([
    file(artifact('test-3', 1), record()),
    file(artifact('test-3', 2), record({ attempt: 2, start: 1_000, end: 1_100 })),
  ], { ...full, attempt: 2 })
  assertEquals(decision.rows, [
    { job: 'test-3', name: 'test · x', outcome: 'success', wall: '1:40', reason: '', budget: '600s' },
  ])
  assertEquals(decision.warnings, [
    {
      code: 'wall-clock-record-other-attempt',
      text: `artifact ${artifact('test-3', 1)}: attempt 1, not the current attempt 2`,
    },
  ])
  assertEquals(decide([file(artifact('test-3', 1), record())], { ...full, attempt: 2 }).rows, [])
})

Deno.test('a needs key with no current-attempt record of its group warns', () => {
  const short = [file(artifact('test-1'), record({ job: 'test-1', start: 0, end: 60 }))]
  assertEquals(decide(short, { ...full, needs: { test: { result: 'success' } } }).warnings, [])
  for (const result of ['failure', 'cancelled']) {
    assertEquals(decide(short, { ...full, needs: { check: { result } } }).warnings, [
      { code: 'wall-clock-record-missing', text: `no record of check in attempt 1, but its needs result is ${result}` },
    ])
  }
  assertEquals(decide(short, { ...full, needs: { check: { result: 'skipped' } } }).warnings, [])
})

Deno.test('a record whose end precedes its start warns and takes no part in the budget', () => {
  const decision = decide([
    file(artifact('test-3'), record({ start: 1_000, end: 200 })),
    file(artifact('test-7'), record({ job: 'test-7', start: 0, end: 600 })),
  ], full)
  assertEquals(decision.rows, [
    { job: 'test-7', name: 'test · x', outcome: 'success', wall: '10:00', reason: '', budget: '600s' },
  ])
  assertEquals(decision.warnings, [
    {
      code: 'wall-clock-record-end-before-start',
      text: `artifact ${artifact('test-3')}: end 200 is before start 1000`,
    },
  ])
})

Deno.test('a job that is both over budget and failed gets its warning and its reason in the row', () => {
  const decision = decide([file(artifact('test-3'), record({ outcome: 'failure', reason: 'test-failed' }))], full)
  assertEquals(decision.rows, [
    {
      job: 'test-3',
      name: 'test · x',
      outcome: 'failure',
      wall: '11:00',
      reason: 'test-failed',
      budget: '600s (over)',
    },
  ])
  assertEquals(decision.warnings, [
    { code: 'wall-clock-over-budget', text: 'job test-3 (test · x) wall 11:00, budget 10:00' },
  ])
})

Deno.test('a failed postsubmit job carries its reason into the row', () => {
  const decision = decide([file(artifact('test-3'), record({ outcome: 'failure', reason: 'nix-build-failed' }))], {
    event: 'push',
    scope: 'full',
    attempt: 1,
  })
  assertEquals(decision.rows[0].reason, 'nix-build-failed')
  assertEquals(decision.warnings, [])
})

Deno.test('annotation text escapes %, CR and LF the way GitHub workflow commands require', () => {
  assertEquals(
    formatWarning({ code: 'wall-clock-record-malformed', text: '50% of\nthe\r\nrecord' }),
    '::warning title=wall-clock-record-malformed::50%25 of%0Athe%0D%0Arecord',
  )
})

Deno.test('a job name that carries a newline and a pipe cannot forge a command or break a table cell', () => {
  const decision = decide([file(artifact('test-3'), record({ name: 'a%b\nc|d', start: 0, end: 660 }))], full)
  assertEquals(
    formatWarning(decision.warnings[0]),
    '::warning title=wall-clock-over-budget::job test-3 (a%25b%0Ac|d) wall 11:00, budget 10:00',
  )
  assertStringIncludes(renderSummary(decision, full), '| test-3 | a%b c\\|d | success | 11:00 |  | 600s (over) |')
})

Deno.test('no records is an empty table and no warnings', () => {
  assertEquals(decide([], full), { rows: [], warnings: [] })
  assertEquals(
    renderSummary({ rows: [], warnings: [] }, full),
    '### Wall clock (budget 10:00 per job, 10:00 per call)\n\n' +
      '| Job | Name | Outcome | Wall | Reason | Budget |\n|---|---|---|---|---|---|\n',
  )
})

Deno.test('a duration renders as minutes and seconds', () => {
  assertEquals(formatDuration(59), '0:59')
  assertEquals(formatDuration(600), '10:00')
  assertEquals(formatDuration(3_600), '60:00')
})

const wallClock = async (records: string, needs: string, summary: string) => {
  const args = [
    'run',
    `--config=${join(here, '..', 'deno.jsonc')}`,
    `--lock=${join(here, '..', 'deno.lock')}`,
    '--frozen',
    '--allow-read',
    '--allow-write',
    '--allow-env',
    join(here, 'wall-clock.ts'),
    '--records',
    records,
    '--attempt',
    '1',
    '--event',
    'pull_request',
    '--scope',
    'full',
    '--needs',
    needs,
  ]
  const out = await new Deno.Command(Deno.execPath(), {
    args,
    env: { GITHUB_STEP_SUMMARY: summary },
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  return { code: out.code, stdout: new TextDecoder().decode(out.stdout).trimEnd().split('\n') }
}

Deno.test('the CLI writes the table to $GITHUB_STEP_SUMMARY, the warnings to stdout, and exits 0', async () => {
  const dir = await Deno.makeTempDir({ prefix: 'wall-clock-' })
  const records = join(dir, 'records')
  const stage = async (name: string, text: string): Promise<void> => {
    await Deno.mkdir(join(records, name), { recursive: true })
    await Deno.writeTextFile(join(records, name, 'record.json'), text)
  }
  await stage(artifact('test-3'), record())
  await stage(
    artifact('test-7'),
    record({ job: 'test-7', name: 'test · y', start: 2_000, end: 2_120, outcome: 'failure', reason: 'test-failed' }),
  )
  const broken = 'job-record-ci-checks-1a2b3c4d-broken-a1'
  await stage(broken, '{not json')
  const needs = join(dir, 'needs.json')
  await Deno.writeTextFile(needs, JSON.stringify({ test: { result: 'success' }, check: { result: 'failure' } }))
  const summary = join(dir, 'summary.md')

  const run = await wallClock(records, needs, summary)

  assertEquals(run.code, 0)
  assertEquals(
    await Deno.readTextFile(summary),
    [
      '### Wall clock (budget 10:00 per job, 10:00 per call)',
      '',
      '| Job | Name | Outcome | Wall | Reason | Budget |',
      '|---|---|---|---|---|---|',
      '| test-3 | test · x | success | 11:00 |  | 600s (over) |',
      '| test-7 | test · y | failure | 2:00 | test-failed | 600s |',
      '',
    ].join('\n'),
  )
  assertEquals(run.stdout, [
    `::warning title=wall-clock-record-malformed::artifact ${broken}: the record is not JSON`,
    '::warning title=wall-clock-over-budget::job test-3 (test · x) wall 11:00, budget 10:00',
    '::warning title=wall-clock-record-missing::no record of check in attempt 1, but its needs result is failure',
  ])
  await Deno.remove(dir, { recursive: true })
})
