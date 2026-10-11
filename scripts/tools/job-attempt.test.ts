import { assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { parseRows, ranIn } from './job-attempt.ts'

const here = dirname(fromFileUrl(import.meta.url))

// Shaped like run 38095184480 after "re-run failed jobs": attempt 2 lists every job again, and the jobs that did
// not re-run keep attempt 1's started_at.
const ROWS = [
  ['mutation / coverage · packages/atom/effect-atom', 1, '2026-10-10T23:30:51Z', 'success'],
  ['mutation / coverage · packages/atom/effect-atom', 2, '2026-10-10T23:30:51Z', 'success'],
  ['mutation / shard · packages/atom/effect-atom 1/3', 1, '2026-10-10T23:43:00Z', 'success'],
  ['mutation / shard · packages/atom/effect-atom 1/3', 2, '2026-10-10T23:43:00Z', 'success'],
  ['mutation / shard · packages/atom/effect-atom 2/3', 1, '2026-10-10T23:43:02Z', 'failure'],
  ['mutation / shard · packages/atom/effect-atom 2/3', 2, '2026-10-11T00:20:10Z', 'success'],
  ['mutation / shard · packages/atom/effect-atom 3/3', 1, '2026-10-10T23:43:05Z', 'success'],
  ['mutation / shard · packages/atom/effect-atom 3/3', 2, '2026-10-10T23:43:05Z', 'success'],
].map((row) => row.join('\t')).join('\n')

Deno.test('Should_PickEachShardFromTheAttemptItRanIn_When_OnlyShardTwoWasReRun', () => {
  const rows = parseRows(ROWS)
  const picked = [1, 2, 3].map((k) => ranIn(rows, `shard · packages/atom/effect-atom ${k}/3`))
  assertEquals(picked, [
    { _tag: 'Ran', attempt: 1, conclusion: 'success' },
    { _tag: 'Ran', attempt: 2, conclusion: 'success' },
    { _tag: 'Ran', attempt: 1, conclusion: 'success' },
  ])
})

Deno.test('Should_NameTheOriginalAttempt_When_ALaterAttemptOnlyCopiedTheJob', () => {
  assertEquals(ranIn(parseRows(ROWS), 'coverage · packages/atom/effect-atom'), {
    _tag: 'Ran',
    attempt: 1,
    conclusion: 'success',
  })
})

Deno.test('Should_ReportTheReRunFailure_When_TheNewestRunOfTheJobFailed', () => {
  const rows = parseRows(
    [
      ['mutation / coverage · packages/discern', 1, '2026-10-10T23:30:51Z', 'success'],
      ['mutation / coverage · packages/discern', 2, '2026-10-11T00:10:00Z', 'failure'],
    ].map((row) => row.join('\t')).join('\n'),
  )
  assertEquals(ranIn(rows, 'coverage · packages/discern'), { _tag: 'Ran', attempt: 2, conclusion: 'failure' })
})

Deno.test('Should_ExitOneNamingTheJob_When_NoRowMatches', async () => {
  const run = (job: string) =>
    new Deno.Command(Deno.execPath(), {
      args: [
        'run',
        `--config=${join(here, '..', 'deno.jsonc')}`,
        `--lock=${join(here, '..', 'deno.lock')}`,
        '--frozen',
        join(here, 'job-attempt.ts'),
        '--job',
        job,
      ],
      stdin: 'piped',
      stdout: 'piped',
      stderr: 'piped',
    }).spawn()
  const write = async (child: Deno.ChildProcess) => {
    const writer = child.stdin.getWriter()
    await writer.write(new TextEncoder().encode(ROWS))
    await writer.close()
    return child.output()
  }
  const found = await write(run('shard · packages/atom/effect-atom 2/3'))
  assertEquals([found.code, new TextDecoder().decode(found.stdout)], [0, '2\tsuccess\n'])
  const missing = await write(run('coverage · packages/nope'))
  assertEquals(missing.code, 1)
})
