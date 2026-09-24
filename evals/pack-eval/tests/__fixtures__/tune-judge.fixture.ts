import { OpenRouterClient, OpenRouterLanguageModel } from '@effect/ai-openrouter'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Console, Effect, Layer, Redacted, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import {
  completionReplyOf,
  type LoopbackReply,
  OpenRouterLoopback,
  type OpenRouterLoopbackShape,
} from './openrouter-loopback.fixture.js'
import { writeDatasetFilesOf } from './pack-eval-dataset.fixture.js'
import {
  ruleTextOf,
  tuneJudgeWorld as tuneJudgeWorldBuilder,
  type World,
  type WorldJudgeReply,
  type WorldPairLabel,
  type WorldPairSplit,
  type WorldVerdict,
} from './pack-eval-world.fixture.js'
import { recordingConsoleOf } from './recording-console.fixture.js'

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

interface TuneJudgeRun {
  readonly world: World
  readonly provider: OpenRouterLoopbackShape
  readonly packDir: string
  readonly datasetDir: string
  readonly cacheDir: string
  readonly lines: Array<string>
}

interface TuneJudgeDisagreement {
  readonly id: string
  readonly taskId: string
  readonly labelVerdict: WorldVerdict
  readonly judgeVerdict: WorldVerdict
  readonly critique: string
}

interface ExpectedTuning {
  readonly devCount: number
  readonly tpr: PackEval.TuneJudge.TuneJudgeRate
  readonly tnr: PackEval.TuneJudge.TuneJudgeRate
  readonly passHits: number
  readonly passTotal: number
  readonly failHits: number
  readonly failTotal: number
  readonly disagreements: ReadonlyArray<TuneJudgeDisagreement>
}

const judgeTextOf = Schema.encodeEffect(Schema.fromJsonString(PackEval.JudgeReply))

const replyOf = (script: DevPairScript): Effect.Effect<LoopbackReply, Schema.SchemaError> =>
  Effect.map(
    judgeTextOf({ critique: script.critique, verdict: script.judgeVerdict }),
    (content) => completionReplyOf({ content, servedModel: 'acme/judge-large@acme' }),
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
      ruleTextOf(first),
    )
    yield* fileSystem.writeFileString(
      paths.join(packDir, `${second.stem}.md`),
      ruleTextOf(second),
    )
    if (world.judgePrompt === undefined) {
      return yield* Effect.die(new Error('the tune-judge world holds no judge prompt'))
    }
    yield* writeDatasetFilesOf({ world, datasetDir })
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
