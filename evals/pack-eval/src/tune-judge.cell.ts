import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Console, Effect, Match, Option } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import {
  buildJudgeRequests,
  type BuildJudgeRequestsCommand,
  type BuildJudgeRequestsError,
  JudgeEmptyTaskText,
  JudgeFewShotNotesEmpty,
  JudgeFewShotPairNotInTrain,
  JudgeFewShotPairUnknown,
  JudgeTarget,
  JudgeUnknownStem,
  JudgeUnknownTask,
} from './build-judge-requests.workflow.js'
import { ContradictionJudge } from './contradiction-judge.service.js'
import {
  ContradictionJudgeRequest,
  ContradictionJudgeRule,
  FewShotExample,
  JudgeFailure,
} from './contradiction-verdict.schema.js'
import type { JudgeVerdict } from './contradiction-verdict.schema.js'
import { DatasetFileRefusal } from './dataset-file.schema.js'
import { readJson, readPack } from './drivers/dataset-files.js'
import { JudgePrompt } from './judge-prompt.schema.js'
import type { PairLabel } from './labels.schema.js'
import { PairLabels } from './labels.schema.js'
import type { RuleFileRefusal } from './pack-rule.schema.js'
import type { AnswerCacheFailure } from './selection-trace.schema.js'
import { TaskSet } from './task-set.schema.js'

export interface TuneJudgeInput {
  readonly packDirs: ReadonlyArray<string>
  readonly datasetDir: string
}

export type TuneJudgeRate = number | '-'

export interface TuneJudgeDisagreement {
  readonly id: string
  readonly taskId: string
  readonly taskText: string
  readonly labelVerdict: JudgeVerdict
  readonly judgeVerdict: JudgeVerdict
  readonly critique: string
}

export interface TuneJudgeResult {
  readonly tpr: TuneJudgeRate
  readonly tnr: TuneJudgeRate
  readonly disagreements: ReadonlyArray<TuneJudgeDisagreement>
}

export type TuneJudgeError =
  | DatasetFileRefusal
  | RuleFileRefusal
  | BuildJudgeRequestsError
  | AnswerCacheFailure
  | JudgeFailure

type TuneJudgeRead = (typeof BuildJudgeRequestsCommand)['Encoded']

type BuiltEncoded = {
  readonly id: string
  readonly request: {
    readonly packId: string
    readonly taskId: string
    readonly taskText: string
    readonly ruleA: { readonly stem: string; readonly title: string; readonly body: string }
    readonly ruleB: { readonly stem: string; readonly title: string; readonly body: string }
    readonly prompt: {
      readonly criterion: string
      readonly passDefinition: string
      readonly failDefinition: string
      readonly fewShotPairIds: ReadonlyArray<string>
    }
    readonly fewShot: ReadonlyArray<{
      readonly taskText: string
      readonly ruleABody: string
      readonly ruleBBody: string
      readonly verdict: JudgeVerdict
      readonly critique: string
    }>
  }
}

interface TuneJudgeRow {
  readonly id: string
  readonly taskId: string
  readonly taskText: string
  readonly labelVerdict: JudgeVerdict
  readonly judgeVerdict: JudgeVerdict
  readonly critique: string
}

interface JudgeTally {
  readonly passHits: number
  readonly passTotal: number
  readonly failHits: number
  readonly failTotal: number
}

const targetOf = (label: PairLabel): JudgeTarget =>
  new JudgeTarget({
    id: label.id,
    packId: label.packId,
    taskId: label.taskId,
    ruleA: label.ruleA,
    ruleB: label.ruleB,
    plantedBody: label.plantedBody,
  })

const read = (
  input: TuneJudgeInput,
): Effect.Effect<TuneJudgeRead, DatasetFileRefusal | RuleFileRefusal, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    const packs = yield* Effect.forEach(input.packDirs, (dir) => readPack(dir))
    const tasks = yield* readJson(paths.join(input.datasetDir, 'tasks.json'), TaskSet)
    const prompt = yield* readJson(paths.join(input.datasetDir, 'judge-prompt.json'), JudgePrompt)
    const pairLabels = yield* readJson(paths.join(input.datasetDir, 'pair-labels.json'), PairLabels)
    return {
      packs,
      tasks,
      prompt,
      pairLabels,
      targets: Arr.map(Arr.filter(pairLabels.entries, (entry) => entry.split === 'dev'), targetOf),
    }
  })

const refuseUnknownTask = (unknown: UnknownTaskEncoded): Effect.Effect<never, BuildJudgeRequestsError> =>
  Effect.fail(new JudgeUnknownTask({ id: unknown.id, taskId: unknown.taskId }))

const refuseUnknownStem = (unknown: UnknownStemEncoded): Effect.Effect<never, BuildJudgeRequestsError> =>
  Effect.fail(new JudgeUnknownStem({ id: unknown.id, packId: unknown.packId, stem: unknown.stem }))

const refuseEmptyTaskText = (empty: EmptyTaskTextEncoded): Effect.Effect<never, BuildJudgeRequestsError> =>
  Effect.fail(new JudgeEmptyTaskText({ id: empty.id, taskId: empty.taskId }))

const refuseFewShotPairUnknown = (
  unknown: FewShotPairUnknownEncoded,
): Effect.Effect<never, BuildJudgeRequestsError> => Effect.fail(new JudgeFewShotPairUnknown({ pairId: unknown.pairId }))

const refuseFewShotPairNotInTrain = (
  outside: FewShotPairNotInTrainEncoded,
): Effect.Effect<never, BuildJudgeRequestsError> =>
  Effect.fail(new JudgeFewShotPairNotInTrain({ pairId: outside.pairId }))

const refuseFewShotNotesEmpty = (
  empty: FewShotNotesEmptyEncoded,
): Effect.Effect<never, BuildJudgeRequestsError> => Effect.fail(new JudgeFewShotNotesEmpty({ pairId: empty.pairId }))

type UnknownTaskEncoded = { readonly id: string; readonly taskId: string }
type UnknownStemEncoded = { readonly id: string; readonly packId: string; readonly stem: string }
type EmptyTaskTextEncoded = { readonly id: string; readonly taskId: string }
type FewShotPairUnknownEncoded = { readonly pairId: string }
type FewShotPairNotInTrainEncoded = { readonly pairId: string }
type FewShotNotesEmptyEncoded = { readonly pairId: string }

const rejectCommand = (rejected: { readonly issue: string }): Effect.Effect<never, DatasetFileRefusal> =>
  Effect.fail(new DatasetFileRefusal({ path: 'the judge tuning inputs', reason: rejected.issue }))

const labelAt = (raw: TuneJudgeRead, id: string): Effect.Effect<PairLabel, never, never> =>
  Effect.suspend(() => {
    const found = raw.pairLabels.entries.find((entry) => entry.id === id)
    return found === undefined
      ? Effect.die(new Error(`the tuned pairs named ${id}, which the pair labels do not hold`))
      : Effect.succeed(found)
  })

const requestAt = (entry: BuiltEncoded): ContradictionJudgeRequest =>
  new ContradictionJudgeRequest({
    packId: entry.request.packId,
    taskId: entry.request.taskId,
    taskText: entry.request.taskText,
    ruleA: new ContradictionJudgeRule({
      stem: entry.request.ruleA.stem,
      title: entry.request.ruleA.title,
      body: entry.request.ruleA.body,
    }),
    ruleB: new ContradictionJudgeRule({
      stem: entry.request.ruleB.stem,
      title: entry.request.ruleB.title,
      body: entry.request.ruleB.body,
    }),
    prompt: new JudgePrompt({
      criterion: entry.request.prompt.criterion,
      passDefinition: entry.request.prompt.passDefinition,
      failDefinition: entry.request.prompt.failDefinition,
      fewShotPairIds: [...entry.request.prompt.fewShotPairIds],
    }),
    fewShot: Arr.map(
      entry.request.fewShot,
      (example) =>
        new FewShotExample({
          taskText: example.taskText,
          ruleABody: example.ruleABody,
          ruleBBody: example.ruleBBody,
          verdict: example.verdict,
          critique: example.critique,
        }),
    ),
  })

const rowsOf = (
  entries: ReadonlyArray<BuiltEncoded>,
  raw: TuneJudgeRead,
): Effect.Effect<ReadonlyArray<TuneJudgeRow>, JudgeFailure | AnswerCacheFailure, ContradictionJudge> =>
  Effect.gen(function*() {
    const judge = yield* ContradictionJudge
    return yield* Effect.forEach(entries, (entry) =>
      Effect.gen(function*() {
        const label = yield* labelAt(raw, entry.id)
        const judged = yield* judge.judge(requestAt(entry))
        return {
          id: entry.id,
          taskId: entry.request.taskId,
          taskText: entry.request.taskText,
          labelVerdict: label.verdict,
          judgeVerdict: judged.verdict,
          critique: judged.critique,
        } satisfies TuneJudgeRow
      }))
  })

const hitsOf = (
  rows: ReadonlyArray<TuneJudgeRow>,
  labelVerdict: JudgeVerdict,
  judgeVerdict: JudgeVerdict,
): number => Arr.filter(rows, (row) => row.labelVerdict === labelVerdict && row.judgeVerdict === judgeVerdict).length

const totalOf = (rows: ReadonlyArray<TuneJudgeRow>, labelVerdict: JudgeVerdict): number =>
  Arr.filter(rows, (row) => row.labelVerdict === labelVerdict).length

const tallyOf = (rows: ReadonlyArray<TuneJudgeRow>): JudgeTally => ({
  passHits: hitsOf(rows, 'Pass', 'Pass'),
  passTotal: totalOf(rows, 'Pass'),
  failHits: hitsOf(rows, 'Fail', 'Fail'),
  failTotal: totalOf(rows, 'Fail'),
})

const rateOf = (hits: number, total: number): TuneJudgeRate =>
  Match.value(total === 0).pipe(
    Match.when(true, () => '-' as const),
    Match.when(false, () => hits / total),
    Match.exhaustive,
  )

const rateTextOf = (rate: TuneJudgeRate, hits: number, total: number): string =>
  Match.value(rate).pipe(
    Match.when('-', () => '-'),
    Match.when(Match.number, (value) => `${percentOf(value)} (${hits}/${total})`),
    Match.exhaustive,
  )

const falsePassRankOf = (row: TuneJudgeRow): number =>
  Match.value(row.labelVerdict === 'Fail' && row.judgeVerdict === 'Pass').pipe(
    Match.when(true, () => 0),
    Match.when(false, () => 1),
    Match.exhaustive,
  )

const disagreementOf = (row: TuneJudgeRow): TuneJudgeDisagreement => ({
  id: row.id,
  taskId: row.taskId,
  taskText: row.taskText,
  labelVerdict: row.labelVerdict,
  judgeVerdict: row.judgeVerdict,
  critique: row.critique,
})

const disagreementsOf = (rows: ReadonlyArray<TuneJudgeRow>): ReadonlyArray<TuneJudgeDisagreement> =>
  Arr.map(
    Arr.filter(rows, (row) => row.labelVerdict !== row.judgeVerdict).toSorted((left, right) =>
      falsePassRankOf(left) - falsePassRankOf(right)
    ),
    disagreementOf,
  )

const lineOf = (disagreement: TuneJudgeDisagreement): string =>
  `- ${disagreement.id} · ${disagreement.taskId} · label ${disagreement.labelVerdict} · judge ${disagreement.judgeVerdict}: ${disagreement.critique}`

const cardOf = (result: TuneJudgeResult, rows: ReadonlyArray<TuneJudgeRow>, tally: JudgeTally): string =>
  [
    '# pack-eval judge tuning',
    '',
    `- dev pairs: ${rows.length}`,
    `- TPR (judge Pass on label Pass): ${rateTextOf(result.tpr, tally.passHits, tally.passTotal)}`,
    `- TNR (judge Fail on label Fail): ${rateTextOf(result.tnr, tally.failHits, tally.failTotal)}`,
    `- disagreements: ${result.disagreements.length}`,
    '',
    '## disagreements',
    '',
    ...Option.match(Arr.head(result.disagreements), {
      onNone: () => ['- none'],
      onSome: () => Arr.map(result.disagreements, lineOf),
    }),
  ].join('\n')

const judgedOf = (
  built: { readonly requests: ReadonlyArray<BuiltEncoded> },
  raw: TuneJudgeRead,
): Effect.Effect<TuneJudgeResult, JudgeFailure | AnswerCacheFailure, ContradictionJudge> =>
  Effect.gen(function*() {
    const rows = yield* rowsOf(built.requests, raw)
    const tally = tallyOf(rows)
    const result: TuneJudgeResult = {
      tpr: rateOf(tally.passHits, tally.passTotal),
      tnr: rateOf(tally.failHits, tally.failTotal),
      disagreements: disagreementsOf(rows),
    }
    yield* Console.log(cardOf(result, rows, tally))
    return result
  })

const percentOf = (rate: number): string => `${(rate * 100).toFixed(1)}%`

export const run = Sandwich.named('pack-eval.tune-judge')((input: TuneJudgeInput) => read(input))
  .decide(buildJudgeRequests)
  .write({
    JudgeRequestsBuilt: judgedOf,
    JudgeUnknownTask: refuseUnknownTask,
    JudgeUnknownStem: refuseUnknownStem,
    JudgeEmptyTaskText: refuseEmptyTaskText,
    JudgeFewShotPairUnknown: refuseFewShotPairUnknown,
    JudgeFewShotPairNotInTrain: refuseFewShotPairNotInTrain,
    JudgeFewShotNotesEmpty: refuseFewShotNotesEmpty,
    CommandRejected: rejectCommand,
  })
