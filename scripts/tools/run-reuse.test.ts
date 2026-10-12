import { assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { shardIdsOf } from './mutation-plan.ts'
import { coverageVerdictOf, digestsOf, flakyTestsOf, priorVerdictOf, recordIdsOf, reuseOf } from './run-reuse.ts'

const here = dirname(fromFileUrl(import.meta.url))

const PRIOR = {
  incrementalVersion: '3',
  verdictSemanticsVersion: 4,
  mutantSetPolicy: 'default',
  runInputsDigest: '67ef359bd86c260557497aae6ce161f1980d9458cbcb0dfd9bfa83066909c577',
  files: {
    'src/judge-propagation-sweep.workflow.ts': {
      language: 'typescript',
      source: '',
      mutants: [
        {
          id: '8891314dd22224b3',
          mutatorName: 'ConditionalExpression',
          replacement: 'true',
          status: 'Timeout',
          statusReason: 'wall-clock-timeout',
          timeoutKind: 'wallClock',
          reproductions: 0,
          location: { start: { line: 36, column: 55 }, end: { line: 36, column: 60 } },
          closureDigest: '0683953c6ea6aad720c998b61b17fdda56b44fa58c191e8139842775d29b393b',
        },
        {
          id: '0c0d7a2634866b46',
          mutatorName: 'ConditionalExpression',
          replacement: 'false',
          status: 'Survived',
          location: { start: { line: 36, column: 55 }, end: { line: 36, column: 60 } },
        },
        {
          id: '09267b6eb867e575',
          mutatorName: 'ConditionalExpression',
          replacement: 'false',
          status: 'CompileError',
          location: { start: { line: 36, column: 7 }, end: { line: 36, column: 30 } },
        },
      ],
    },
  },
  costs: { '8891314dd22224b3': { predictedMs: 8876.765592, actualMs: 30000, coveringTests: 6 } },
  dryRunCoverage: { tests: [], timeOverheadMs: 0, flakyTestIds: [], flakyMutantIds: [] },
}

const COVERAGE_DIGESTS = {
  testClosureDigest: '3270e2c6d577f587f3f20176b4975b2a7c37c2e911c800a45a77a08da08976b',
  runInputsDigest: '67ef359bd86c260557497aae6ce161f1980d9458cbcb0dfd9bfa83066909c577',
}

const dryRunOf = (testClosureDigest: string) => ({
  tests: [
    {
      id: 'src/Rel.ts#∀g_Exists_=Nonempty',
      name: '∀g_Exists_=Nonempty',
      timeSpentMs: 163.52694099999999,
      fileName: '/home/runner/work/systemfsoftware/systemfsoftware/packages/trace/trace-spec/src/Rel.ts',
      status: 'success',
    },
    {
      id: 'src/Rel.ts#∀g_Absent_=¬Nonempty',
      name: '∀g_Absent_=¬Nonempty',
      timeSpentMs: 153.305388,
      fileName: '/home/runner/work/systemfsoftware/systemfsoftware/packages/trace/trace-spec/src/Rel.ts',
      status: 'success',
    },
  ],
  mutantCoverage: { static: {}, perTest: {} },
  globalTestInputs: [],
  timeOverheadMs: 0,
  flakyTestIds: ['tests/case-prop-holds.trace.test.ts#81', 'src/Rel.ts#∀g_Exists_=Nonempty'],
  flakyMutantIds: ['001226d952bc74a9'],
  testClosureDigest,
  runInputsDigest: COVERAGE_DIGESTS.runInputsDigest,
})

const COVERAGE = { ...PRIOR, files: {}, dryRunCoverage: dryRunOf(COVERAGE_DIGESTS.testClosureDigest) }
const SHARD_REUSED = { ...PRIOR, dryRunCoverage: dryRunOf(COVERAGE_DIGESTS.testClosureDigest) }
const SHARD_RAN_ITS_OWN = {
  ...PRIOR,
  dryRunCoverage: dryRunOf('925de28e6de3f272a9b1c7d0e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0'),
}

const PLAN = {
  version: 1,
  targetSeconds: 780,
  shards: [
    {
      index: 1,
      count: 2,
      predictedSeconds: 60,
      projects: [{
        project: 'packages/atom/effect-atom',
        mutants: ['8891314dd22224b3', '0c0d7a2634866b46', '09267b6eb867e575', 'aaaaaaaaaaaaaaa1', 'aaaaaaaaaaaaaaa2'],
      }],
    },
    {
      index: 2,
      count: 2,
      predictedSeconds: 60,
      projects: [{ project: 'packages/atom/effect-atom', mutants: ['bbbbbbbbbbbbbbb1', 'bbbbbbbbbbbbbbb2'] }],
    },
  ],
}

const refused = (counts: Readonly<Record<string, number>>) => ({
  semanticsChanged: 0,
  policyChanged: 0,
  runInputsChanged: 0,
  closureChanged: 0,
  timeoutUnreproduced: 0,
  flakyDependency: 0,
  noPriorRecord: 0,
  ...counts,
})

const streamOf = (reuse: unknown): string =>
  [
    JSON.stringify({ _tag: 'plugins', schemaVersion: 1 }),
    JSON.stringify(reuse),
    JSON.stringify({ _tag: 'mutant-detail', id: '8891314dd22224b3', status: 'Timeout' }),
    '',
  ].join('\n')

const UNREAD = streamOf({ _tag: 'reuse', reused: 0, ran: 5, refused: refused({ noPriorRecord: 5 }) })
const READ = streamOf({
  _tag: 'reuse',
  reused: 1,
  ran: 4,
  refused: refused({ timeoutUnreproduced: 1, closureChanged: 1, noPriorRecord: 2 }),
})

const verdictOf = (shard: number, stream: string) =>
  priorVerdictOf(shardIdsOf(PLAN, shard), recordIdsOf(PRIOR), reuseOf(stream))._tag

Deno.test('Should_RefuseTheRun_When_ThePriorNamesPlannedMutantsAndEveryOneRanForWantOfARecord', () => {
  assertEquals(verdictOf(1, UNREAD), 'Unread')
})

Deno.test('Should_PassTheRun_When_TheRunReusedAVerdictFromThePrior', () => {
  assertEquals(verdictOf(1, READ), 'Read')
})

Deno.test('Should_PassTheRun_When_NothingWasReusedButSomeMutantRanForAReasonOnlyARecordGives', () => {
  const rerun = streamOf({
    _tag: 'reuse',
    reused: 0,
    ran: 5,
    refused: refused({ timeoutUnreproduced: 1, noPriorRecord: 4 }),
  })
  assertEquals(verdictOf(1, rerun), 'Read')
})

Deno.test('Should_PassTheRun_When_ThePriorNamesNoneOfThisShardsMutants', () => {
  const unread = streamOf({ _tag: 'reuse', reused: 0, ran: 2, refused: refused({ noPriorRecord: 2 }) })
  assertEquals(verdictOf(2, unread), 'NothingToRead')
})

Deno.test('Should_RefuseTheRun_When_TheStreamHoldsNoReuseEvent', () => {
  assertEquals(verdictOf(1, JSON.stringify({ _tag: 'plugins', schemaVersion: 1 })), 'NoReuseReport')
})

Deno.test('Should_JudgeTheCoverageReused_Only_When_BothDigestsMatchTheCoverageJobs', () => {
  const coverage = digestsOf(COVERAGE)
  const otherInputs = { ...SHARD_REUSED.dryRunCoverage, runInputsDigest: COVERAGE_DIGESTS.testClosureDigest }
  assertEquals(
    [
      coverageVerdictOf(coverage, digestsOf(SHARD_REUSED))._tag,
      coverageVerdictOf(coverage, digestsOf(SHARD_RAN_ITS_OWN))._tag,
      coverageVerdictOf(coverage, digestsOf({ ...SHARD_REUSED, dryRunCoverage: otherInputs }))._tag,
      coverageVerdictOf(coverage, digestsOf(PRIOR))._tag,
      coverageVerdictOf(digestsOf(PRIOR), digestsOf(SHARD_REUSED))._tag,
    ],
    ['Reused', 'Unreused', 'Unreused', 'Unreused', 'Unreused'],
  )
})

Deno.test('Should_ListEachFlaggedTestWithItsFirstPassStatus_When_TheDryRunFlaggedTests', () => {
  assertEquals(flakyTestsOf(SHARD_REUSED), [
    { id: 'src/Rel.ts#∀g_Exists_=Nonempty', firstPass: 'success' },
    { id: 'tests/case-prop-holds.trace.test.ts#81', firstPass: undefined },
  ])
  assertEquals(flakyTestsOf(PRIOR), [])
})

Deno.test('Should_ExitByVerdictAndWriteTheReason_When_RunAsACommand', async () => {
  const dir = await Deno.makeTempDir()
  const path = (name: string) => join(dir, name)
  const fixtures: Record<string, string> = {
    'plan.json': JSON.stringify(PLAN),
    'prior.json': JSON.stringify(PRIOR),
    'broken.json': '{"files": ',
    'coverage.json': JSON.stringify(COVERAGE),
    'reused.json': JSON.stringify(SHARD_REUSED),
    'own.json': JSON.stringify(SHARD_RAN_ITS_OWN),
    'read.jsonl': READ,
    'unread.jsonl': UNREAD,
  }
  for (const [name, text] of Object.entries(fixtures)) await Deno.writeTextFile(path(name), text)
  const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
  const run = async (args: readonly string[]) => {
    await Deno.remove(path('reason')).catch(() => undefined)
    const out = await new Deno.Command(Deno.execPath(), {
      args: [
        'run',
        `--config=${join(here, '..', 'deno.jsonc')}`,
        `--lock=${join(here, '..', 'deno.lock')}`,
        '--frozen',
        `--allow-read=${dir}`,
        `--allow-write=${dir}`,
        join(here, 'run-reuse.ts'),
        ...args,
        '--reason-file',
        path('reason'),
      ],
      stdout: 'piped',
      stderr: 'piped',
    }).output()
    const reason = await Deno.readTextFile(path('reason')).catch(() => '')
    return [out.code, reason, text(out.stdout)] as const
  }
  const shard = (prior: string, stream: string, record: string) => [
    '--plan',
    path('plan.json'),
    '--shard',
    '1',
    '--prior',
    path(prior),
    '--stream',
    path(stream),
    '--record',
    path(record),
  ]
  const details = ['--label', 'packages/trace/trace-spec 1/2', '--details', path('details.md')]
  const results = [
    await run([...shard('prior.json', 'read.jsonl', 'prior.json')]),
    await run([...shard('prior.json', 'unread.jsonl', 'prior.json')]),
    await run([...shard('broken.json', 'read.jsonl', 'prior.json')]),
    await run([...shard('absent.json', 'unread.jsonl', 'prior.json')]),
    await run([...shard('prior.json', 'read.jsonl', 'reused.json'), '--coverage', path('coverage.json'), ...details]),
    await run([...shard('absent.json', 'read.jsonl', 'own.json'), '--coverage', path('coverage.json')]),
    await run([...shard('prior.json', 'read.jsonl', 'absent.json')]),
    await run(['--plan', path('plan.json'), '--prior', path('prior.json')]),
  ]
  const written = await Deno.readTextFile(path('details.md'))
  await Deno.remove(dir, { recursive: true })
  assertEquals(results, [
    [
      0,
      '',
      'reused 1, ran 4 (closureChanged 1, timeoutUnreproduced 1, noPriorRecord 2); the prior record names 3 of 5; ' +
      'flaky tests 0\n',
    ],
    [1, 'mutation-prior-unread\n', ''],
    [1, 'mutation-prior-unread\n', ''],
    [0, '', 'no prior record; flaky tests 0\n'],
    [
      0,
      '',
      'reused 1, ran 4 (closureChanged 1, timeoutUnreproduced 1, noPriorRecord 2); the prior record names 3 of 5; ' +
      'flaky tests 2; dry run reused from the coverage job\n',
    ],
    [1, 'mutation-coverage-unreused\n', ''],
    [1, 'mutation-tool-misused\n', ''],
    [2, '', ''],
  ])
  assertEquals(
    written.split('\n').filter((line) =>
      line.startsWith('<details>') || line.startsWith('| src/') || line.startsWith('| tests/')
    ),
    [
      '<details><summary>packages/trace/trace-spec 1/2: 2 flaky tests</summary>',
      '| src/Rel.ts#∀g_Exists_=Nonempty | success |',
      '| tests/case-prop-holds.trace.test.ts#81 | absent |',
    ],
  )
})
