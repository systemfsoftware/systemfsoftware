import { assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { priorVerdictOf, recordIdsOf, reuseOf, shardIdsOf } from './prior-read.ts'

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

Deno.test('Should_ExitByVerdictAndWriteTheReason_When_RunAsACommand', async () => {
  const dir = await Deno.makeTempDir()
  const path = (name: string) => join(dir, name)
  await Deno.writeTextFile(path('plan.json'), JSON.stringify(PLAN))
  await Deno.writeTextFile(path('prior.json'), JSON.stringify(PRIOR))
  await Deno.writeTextFile(path('broken.json'), '{"files": ')
  await Deno.writeTextFile(path('read.jsonl'), READ)
  await Deno.writeTextFile(path('unread.jsonl'), UNREAD)
  const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
  const run = async (prior: string, stream: string, extra: readonly string[] = []) => {
    await Deno.remove(path('reason'), { recursive: true }).catch(() => undefined)
    const out = await new Deno.Command(Deno.execPath(), {
      args: [
        'run',
        `--config=${join(here, '..', 'deno.jsonc')}`,
        `--lock=${join(here, '..', 'deno.lock')}`,
        '--frozen',
        `--allow-read=${dir}`,
        `--allow-write=${path('reason')}`,
        join(here, 'prior-read.ts'),
        ...extra,
        '--prior',
        path(prior),
        '--stream',
        path(stream),
        '--reason-file',
        path('reason'),
      ],
      stdout: 'piped',
      stderr: 'piped',
    }).output()
    const reason = await Deno.readTextFile(path('reason')).catch(() => '')
    return [out.code, reason, text(out.stdout)] as const
  }
  const plan = ['--plan', path('plan.json'), '--shard', '1']
  const results = [
    await run('prior.json', 'read.jsonl', plan),
    await run('prior.json', 'unread.jsonl', plan),
    await run('broken.json', 'read.jsonl', plan),
    await run('absent.json', 'unread.jsonl', plan),
    await run('prior.json', 'read.jsonl', ['--plan', path('plan.json')]),
  ]
  await Deno.remove(dir, { recursive: true })
  assertEquals(results, [
    [
      0,
      '',
      'reused 1, ran 4 (closureChanged 1, timeoutUnreproduced 1, noPriorRecord 2); the prior record names 3 of 5\n',
    ],
    [1, 'mutation-prior-unread\n', ''],
    [1, 'mutation-prior-unread\n', ''],
    [0, '', 'no prior record\n'],
    [2, '', ''],
  ])
})
