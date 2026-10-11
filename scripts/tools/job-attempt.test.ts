import { assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { artifactOf, parseArtifacts, parseRows, ranIn, runVerdict } from './job-attempt.ts'

const here = dirname(fromFileUrl(import.meta.url))

const tsv = (rows: ReadonlyArray<ReadonlyArray<string | number>>): string =>
  rows.map((row) => row.join('\t')).join('\n')

// Shaped like run 38095184480 after "re-run failed jobs": attempt 2 lists every job again, and the jobs that did
// not re-run keep attempt 1's started_at.
const ROWS = tsv([
  ['mutation / coverage · packages/atom/effect-atom', 1, '2026-10-10T23:30:51Z', 'success'],
  ['mutation / coverage · packages/atom/effect-atom', 2, '2026-10-10T23:30:51Z', 'success'],
  ['mutation / shard · packages/atom/effect-atom 1/3', 1, '2026-10-10T23:43:00Z', 'success'],
  ['mutation / shard · packages/atom/effect-atom 1/3', 2, '2026-10-10T23:43:00Z', 'success'],
  ['mutation / shard · packages/atom/effect-atom 2/3', 1, '2026-10-10T23:43:02Z', 'failure'],
  ['mutation / shard · packages/atom/effect-atom 2/3', 2, '2026-10-11T00:20:10Z', 'success'],
  ['mutation / shard · packages/atom/effect-atom 3/3', 1, '2026-10-10T23:43:05Z', 'success'],
  ['mutation / shard · packages/atom/effect-atom 3/3', 2, '2026-10-10T23:43:05Z', 'success'],
])

const SHARD_FAILED_MERGE_PASSED = tsv([
  ['mutation / plan · one stryker plan per project', 1, '2026-10-10T23:20:00Z', 'success'],
  ['mutation / coverage · packages/atom/effect-atom', 1, '2026-10-10T23:30:51Z', 'success'],
  ['mutation / shard · packages/atom/effect-atom 1/2', 1, '2026-10-10T23:43:00Z', 'success'],
  ['mutation / shard · packages/atom/effect-atom 2/2', 1, '2026-10-10T23:43:02Z', 'failure'],
  ['mutation / batch · 1', 1, '2026-10-10T23:43:04Z', 'skipped'],
  ['mutation / merge · gate · packages/atom/effect-atom', 1, '2026-10-11T00:10:00Z', 'success'],
  ['mutation / Mutation report', 1, '2026-10-11T00:20:00Z', ''],
  ['record mutation timings', 1, '', ''],
])

const SHARD = 'shard · packages/atom/effect-atom 2/3'
const PREFIX = 'mutation-shard-atom-effect-atom-2of3'

interface Cli {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
  readonly reason: string
}

const cli = async (args: readonly string[], stdin: string, names?: string): Promise<Cli> => {
  const dir = await Deno.makeTempDir()
  const reason = join(dir, 'reason')
  const namesFile = join(dir, 'artifacts.tsv')
  if (names !== undefined) await Deno.writeTextFile(namesFile, names)
  const child = new Deno.Command(Deno.execPath(), {
    args: [
      'run',
      `--config=${join(here, '..', 'deno.jsonc')}`,
      `--lock=${join(here, '..', 'deno.lock')}`,
      '--frozen',
      `--allow-read=${namesFile}`,
      `--allow-write=${reason}`,
      join(here, 'job-attempt.ts'),
      ...args.map((arg) => arg.replace('{names}', namesFile).replace('{reason}', reason)),
    ],
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'piped',
  }).spawn()
  const writer = child.stdin.getWriter()
  await writer.write(new TextEncoder().encode(stdin)).catch(() => undefined)
  await writer.close().catch(() => undefined)
  const out = await child.output()
  const written = await Deno.readTextFile(reason).catch(() => '')
  await Deno.remove(dir, { recursive: true })
  return {
    code: out.code,
    stdout: new TextDecoder().decode(out.stdout),
    stderr: new TextDecoder().decode(out.stderr),
    reason: written,
  }
}

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
  const rows = parseRows(tsv([
    ['mutation / coverage · packages/discern', 1, '2026-10-10T23:30:51Z', 'success'],
    ['mutation / coverage · packages/discern', 2, '2026-10-11T00:10:00Z', 'failure'],
  ]))
  assertEquals(ranIn(rows, 'coverage · packages/discern'), { _tag: 'Ran', attempt: 2, conclusion: 'failure' })
})

Deno.test('Should_KeepArtifacts_When_AShardFailedButItsMergePassed', () => {
  assertEquals(runVerdict(parseRows(SHARD_FAILED_MERGE_PASSED)), {
    _tag: 'Unsuccessful',
    jobs: ['mutation / shard · packages/atom/effect-atom 2/2'],
  })
})

Deno.test('Should_AllowDeletion_When_EveryJobSucceededInTheAttemptItLastRanIn', () => {
  assertEquals(runVerdict(parseRows(ROWS)), { _tag: 'AllSucceeded' })
})

Deno.test('Should_KeepArtifacts_When_TheRunListsNoJobs', () => {
  assertEquals(runVerdict(parseRows('')), { _tag: 'NoJobs' })
})

Deno.test('Should_ExitByVerdict_When_AllSucceededRunsAsACommand', async () => {
  const outcomes = await Promise.all(
    [ROWS, SHARD_FAILED_MERGE_PASSED, ''].map((rows) => cli(['--all-succeeded'], rows)),
  )
  assertEquals(outcomes.map((outcome) => outcome.code), [0, 1, 1])
  assertEquals(
    [/shard · packages\/atom\/effect-atom 2\/2/.test(outcomes[1]!.stderr), /no jobs/.test(outcomes[2]!.stderr)],
    [true, true],
  )
})

Deno.test('Should_FindTheArtifactUnderAnOlderAttempt_When_TheNewestAttemptHasNone', () => {
  assertEquals(artifactOf(parseRows(ROWS), SHARD, PREFIX, parseArtifacts(`${PREFIX}-a1\tfalse\n`)), {
    _tag: 'Found',
    name: `${PREFIX}-a1`,
  })
})

Deno.test('Should_PreferTheNewestAttempt_When_SeveralAttemptsHoldTheArtifact', () => {
  const names = parseArtifacts(`${PREFIX}-a1\tfalse\n${PREFIX}-a2\tfalse\n`)
  assertEquals(artifactOf(parseRows(ROWS), SHARD, PREFIX, names), { _tag: 'Found', name: `${PREFIX}-a2` })
})

Deno.test('Should_ReportMissing_When_TheOnlyMatchingArtifactExpired', () => {
  assertEquals(artifactOf(parseRows(ROWS), SHARD, PREFIX, parseArtifacts(`${PREFIX}-a2\ttrue\n`)), {
    _tag: 'Missing',
    searched: [2, 1],
  })
})

Deno.test('Should_PrintTheArtifactNameAsFieldThree_When_TheArtifactIsFound', async () => {
  const found = await cli(
    ['--job', SHARD, '--artifact', PREFIX, '--artifacts', '{names}', '--reason-file', '{reason}'],
    ROWS,
    `${PREFIX}-a1\tfalse\n`,
  )
  assertEquals([found.code, found.stdout.trimEnd().split('\t')[2], found.reason], [0, `${PREFIX}-a1`, ''])
})

Deno.test('Should_WriteTheReasonCodeNamingTheSearchedAttempts_When_TheArtifactIsMissing', async () => {
  const missing = await cli(
    ['--job', SHARD, '--artifact', PREFIX, '--artifacts', '{names}', '--reason-file', '{reason}'],
    ROWS,
    `${PREFIX}-a2\ttrue\n`,
  )
  assertEquals(
    [missing.code, missing.reason, /effect-atom 2\/3/.test(missing.stderr), /searched: 2, 1\)/.test(missing.stderr)],
    [1, 'mutation-artifact-missing\n', true, true],
  )
})

Deno.test('Should_RefuseAsMisuse_When_ArtifactComesWithoutANamesFile', async () => {
  const misused = await cli(['--job', SHARD, '--artifact', PREFIX, '--reason-file', '{reason}'], ROWS)
  assertEquals([misused.code, misused.reason], [2, 'mutation-tool-misused\n'])
})

Deno.test('Should_RefuseAsMisuse_When_TheNamesFileCannotBeRead', async () => {
  const unreadable = await cli(
    ['--job', SHARD, '--artifact', PREFIX, '--artifacts', '{names}', '--reason-file', '{reason}'],
    ROWS,
  )
  assertEquals([unreadable.code, unreadable.reason], [1, 'mutation-tool-misused\n'])
})

Deno.test('Should_ExitTwoWithoutReadingInput_When_NoModeIsGiven', async () => {
  const child = new Deno.Command(Deno.execPath(), {
    args: [
      'run',
      `--config=${join(here, '..', 'deno.jsonc')}`,
      `--lock=${join(here, '..', 'deno.lock')}`,
      '--frozen',
      join(here, 'job-attempt.ts'),
    ],
    stdin: 'piped',
    stdout: 'null',
    stderr: 'null',
  }).spawn()
  // stdin stays open: a tool that read it before validating would hang here instead of exiting.
  const status = await child.status
  await child.stdin.close()
  assertEquals(status.code, 2)
})

Deno.test('Should_ExitOneNamingTheJob_When_NoRowMatches', async () => {
  const found = await cli(['--job', SHARD], ROWS)
  const missing = await cli(['--job', 'coverage · packages/nope'], ROWS)
  assertEquals([found.code, found.stdout, missing.code], [0, '2\tsuccess\n', 1])
})
