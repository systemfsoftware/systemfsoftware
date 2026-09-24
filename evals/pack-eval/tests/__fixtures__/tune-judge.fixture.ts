import { OpenRouterClient, OpenRouterLanguageModel } from '@effect/ai-openrouter'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Console, Effect, Layer, Redacted, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import { type LoopbackReply, OpenRouterLoopback, type OpenRouterLoopbackShape } from './openrouter-loopback.fixture.js'
import {
  tuneJudgeWorld as tuneJudgeWorldBuilder,
  type World,
  type WorldJudgeReply,
  type WorldPairLabel,
  type WorldPairSplit,
  type WorldVerdict,
} from './pack-eval-world.fixture.js'

/**
 * The tune-judge area's interpreter: a world with one scripted dev pair per
 * row is written to scratch, the loopback answers the dev pairs in label
 * order, and the reference rates are derived from the same scripted verdicts.
 * Nothing in the expected tuning is typed by hand.
 */

export type DevPairScript = Readonly<{
  readonly id: string
  readonly taskId: string
  readonly labelVerdict: WorldVerdict
  readonly judgeVerdict: WorldVerdict
  readonly critique: string
}>

export interface TuneJudgeRun {
  readonly world: World
  readonly provider: OpenRouterLoopbackShape
  readonly packDir: string
  readonly datasetDir: string
  readonly cacheDir: string
  readonly lines: Array<string>
}

export interface TuneJudgeDisagreement {
  readonly id: string
  readonly taskId: string
  readonly labelVerdict: WorldVerdict
  readonly judgeVerdict: WorldVerdict
  readonly critique: string
}

export interface ExpectedTuning {
  readonly devCount: number
  readonly tpr: PackEval.TuneJudge.TuneJudgeRate
  readonly tnr: PackEval.TuneJudge.TuneJudgeRate
  readonly passHits: number
  readonly passTotal: number
  readonly failHits: number
  readonly failTotal: number
  readonly disagreements: ReadonlyArray<TuneJudgeDisagreement>
}

const ruleTextOf = (stem: string, title: string, appliesWhen: string, body: string): string =>
  ['---', `title: ${title}`, `applies_when: [${appliesWhen}]`, 'tags: [air]', '---', '', body, ''].join('\n')

const judgeTextOf = Schema.encodeEffect(Schema.fromJsonString(PackEval.JudgeReply))

const replyOf = (script: DevPairScript): Effect.Effect<LoopbackReply, Schema.SchemaError> =>
  Effect.map(
    judgeTextOf({ critique: script.critique, verdict: script.judgeVerdict }),
    (content) => ({
      status: 200,
      body: {
        id: 'tune-judge-loopback',
        object: 'chat.completion',
        created: 1_760_000_000,
        model: 'acme/judge-large@acme',
        system_fingerprint: null,
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
      },
    }),
  )

const devPairLabelOf = (world: World, script: DevPairScript): WorldPairLabel => ({
  id: script.id,
  taskId: script.taskId,
  packId: world.packs[0]?.id ?? 'pack',
  ruleA: 'hourly-venting',
  ruleB: 'sealed-ripening',
  split: 'dev' satisfies WorldPairSplit,
  verdict: script.labelVerdict,
  origin: 'observed',
  notes: script.critique,
})

const devJudgeReplyOf = (world: World, script: DevPairScript): WorldJudgeReply => ({
  kind: 'judged',
  question: {
    packId: world.packs[0]?.id ?? 'pack',
    taskId: script.taskId,
    ruleA: 'hourly-venting',
    ruleB: 'sealed-ripening',
    plantedBody: undefined,
  },
  verdict: script.judgeVerdict,
  critique: script.critique,
  servedModel: 'acme/judge-large@acme',
})

const scriptedWorldOf = (scripts: ReadonlyArray<DevPairScript>): World => {
  const base = tuneJudgeWorldBuilder()
  return tuneJudgeWorldBuilder({
    pairLabels: [
      ...base.pairLabels.filter((label) => label.split !== 'dev'),
      ...scripts.map((script) => devPairLabelOf(base, script)),
    ],
    answers: {
      selector: [],
      judge: scripts.map((script) => devJudgeReplyOf(base, script)),
      generator: { kind: 'proposed', proposedTuples: [], writtenTasks: [] },
    },
  })
}

const recordingConsoleOf = (lines: Array<string>): Console.Console => ({
  assert: () => undefined,
  clear: () => undefined,
  count: () => undefined,
  countReset: () => undefined,
  debug: () => undefined,
  dir: () => undefined,
  dirxml: () => undefined,
  error(...args: ReadonlyArray<string>) {
    lines.push(args.join(' '))
  },
  group: () => undefined,
  groupCollapsed: () => undefined,
  groupEnd: () => undefined,
  info: () => undefined,
  log(...args: ReadonlyArray<string>) {
    lines.push(args.join(' '))
  },
  table: () => undefined,
  time: () => undefined,
  timeEnd: () => undefined,
  timeLog: () => undefined,
  trace: () => undefined,
  warn: () => undefined,
})

export const tuneJudgeStackOf = (run: TuneJudgeRun) =>
  Layer.provideMerge(
    Layer.provideMerge(
      Layer.provideMerge(
        PackEval.OpenRouterContradictionJudge.layer({ model: 'acme/judge-large' }),
        PackEval.FileAnswerCache.layer({ cacheDir: run.cacheDir }),
      ),
      OpenRouterLanguageModel.layer({ model: 'acme/judge-large' }),
    ),
    Layer.merge(
      OpenRouterClient.layer({ apiUrl: run.provider.apiUrl, apiKey: Redacted.make('sk-loopback') }),
      Layer.succeed(Console.Console, recordingConsoleOf(run.lines)),
    ),
  )

export const tuneJudgeRunOf = (scripts: ReadonlyArray<DevPairScript>) =>
  Effect.gen(function*() {
    const provider = yield* OpenRouterLoopback
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    const world = scriptedWorldOf(scripts)
    yield* provider.answerWith(yield* Effect.forEach(scripts, replyOf))
    const base = yield* fileSystem.makeTempDirectoryScoped()
    const datasetDir = paths.join(base, 'dataset')
    const packDir = paths.join(base, 'packs', world.packs[0]?.id ?? 'pack')
    const cacheDir = yield* fileSystem.makeTempDirectoryScoped()
    yield* fileSystem.makeDirectory(packDir, { recursive: true })
    yield* fileSystem.makeDirectory(datasetDir, { recursive: true })
    const rules = world.packs.flatMap((pack) => pack.rules)
    const first = rules[0]
    const second = rules[1]
    if (first === undefined || second === undefined) {
      return yield* Effect.die(new Error('the tune-judge world holds fewer than two rules'))
    }
    yield* fileSystem.writeFileString(
      paths.join(packDir, `${first.stem}.md`),
      ruleTextOf(first.stem, first.title, first.appliesWhen[0] ?? '', first.body),
    )
    yield* fileSystem.writeFileString(
      paths.join(packDir, `${second.stem}.md`),
      ruleTextOf(second.stem, second.title, second.appliesWhen[0] ?? '', second.body),
    )
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'tasks.json'),
      PackEval.TaskSet,
      new PackEval.TaskSet({
        version: 1,
        tasks: world.tasks.map((task) =>
          new PackEval.Task({ id: task.id, text: task.text, split: task.split, dimensions: task.dimensions })
        ),
      }),
    )
    const prompt = world.judgePrompt
    if (prompt === undefined) {
      return yield* Effect.die(new Error('the tune-judge world holds no judge prompt'))
    }
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'judge-prompt.json'),
      PackEval.JudgePrompt,
      new PackEval.JudgePrompt({
        criterion: prompt.criterion,
        passDefinition: prompt.passDefinition,
        failDefinition: prompt.failDefinition,
        fewShotPairIds: prompt.fewShotPairIds,
      }),
    )
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'pair-labels.json'),
      PackEval.PairLabels,
      new PackEval.PairLabels({
        version: 1,
        entries: world.pairLabels.map((label) =>
          new PackEval.PairLabel({
            id: label.id,
            taskId: label.taskId,
            packId: label.packId,
            ruleA: label.ruleA,
            ruleB: label.ruleB,
            split: label.split,
            verdict: label.verdict,
            origin: label.origin,
            notes: label.notes,
            ...(label.plantedBody === undefined ? {} : { plantedBody: label.plantedBody }),
          })
        ),
      }),
    )
    return { world, provider, packDir, datasetDir, cacheDir, lines: [] } satisfies TuneJudgeRun
  })

const rateOf = (hits: number, total: number): PackEval.TuneJudge.TuneJudgeRate => total === 0 ? '-' : hits / total

const falsePassRankOf = (script: DevPairScript): number =>
  script.labelVerdict === 'Fail' && script.judgeVerdict === 'Pass' ? 0 : 1

export const expectedTuningOf = (scripts: ReadonlyArray<DevPairScript>): ExpectedTuning => {
  const hits = (labelVerdict: WorldVerdict, judgeVerdict: WorldVerdict): number =>
    scripts.filter((script) => script.labelVerdict === labelVerdict && script.judgeVerdict === judgeVerdict).length
  const passHits = hits('Pass', 'Pass')
  const passTotal = passHits + hits('Pass', 'Fail')
  const failHits = hits('Fail', 'Fail')
  const failTotal = failHits + hits('Fail', 'Pass')
  return {
    devCount: scripts.length,
    tpr: rateOf(passHits, passTotal),
    tnr: rateOf(failHits, failTotal),
    passHits,
    passTotal,
    failHits,
    failTotal,
    disagreements: scripts
      .filter((script) => script.labelVerdict !== script.judgeVerdict)
      .toSorted((left, right) => falsePassRankOf(left) - falsePassRankOf(right))
      .map((script) => ({
        id: script.id,
        taskId: script.taskId,
        labelVerdict: script.labelVerdict,
        judgeVerdict: script.judgeVerdict,
        critique: script.critique,
      })),
  }
}
