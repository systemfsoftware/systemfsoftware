import { OpenRouterClient, OpenRouterLanguageModel } from '@effect/ai-openrouter'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect, Layer, Match, Redacted, Result, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { expect } from 'vitest'
import {
  type LoopbackReply,
  OpenRouterLoopback,
  openRouterLoopback,
  type OpenRouterLoopbackShape,
  type RecordedRequest,
} from './__fixtures__/openrouter-loopback.fixture.js'
import {
  contradictionJudgeWorld,
  type World,
  type WorldJudgePrompt,
  type WorldPack,
  type WorldPairLabel,
  type WorldTask,
} from './__fixtures__/pack-eval-world.fixture.js'

const Feature = makeFeature({ it, layer })

const askedModel = 'acme/judge-large'
const servedModel = 'acme/judge-large@acme'

const headOf = <T>(values: ReadonlyArray<T>, what: string): T => {
  const [first] = values
  if (first === undefined) throw new Error(`the judge world holds no ${what}`)
  return first
}

const ruleOf = (pack: WorldPack, stem: string) => {
  const rule = pack.rules.find((entry) => entry.stem === stem)
  if (rule === undefined) throw new Error(`the judge world holds no rule ${stem}`)
  return new PackEval.ContradictionJudgeRule({ stem: rule.stem, title: rule.title, body: rule.body })
}

const taskOf = (world: World, taskId: string): WorldTask => {
  const task = world.tasks.find((entry) => entry.id === taskId)
  if (task === undefined) throw new Error(`the judge world holds no task ${taskId}`)
  return task
}

const promptOf = (world: World): WorldJudgePrompt => {
  const prompt = world.judgePrompt
  if (prompt === undefined) throw new Error('the judge world holds no judge prompt')
  return prompt
}

const exampleOf = (world: World, packId: string, label: WorldPairLabel) => {
  const task = taskOf(world, label.taskId)
  const pack = headOf(world.packs.filter((entry) => entry.id === packId), 'pack')
  const bodyOf = (stem: string): string => {
    const rule = pack.rules.find((entry) => entry.stem === stem)
    if (rule === undefined) throw new Error(`the judge world holds no rule ${stem}`)
    return label.plantedBody !== undefined && stem === label.ruleB ? label.plantedBody : rule.body
  }
  return new PackEval.FewShotExample({
    taskText: task.text,
    ruleABody: bodyOf(label.ruleA),
    ruleBBody: bodyOf(label.ruleB),
    verdict: label.verdict,
    critique: label.notes,
  })
}

const judgeRequestOf = (world: World): PackEval.ContradictionJudgeRequest => {
  const pack = headOf(world.packs, 'pack')
  const label = headOf(world.pairLabels.filter((entry) => entry.split === 'test'), 'test pair label')
  const task = taskOf(world, label.taskId)
  const prompt = promptOf(world)
  return new PackEval.ContradictionJudgeRequest({
    packId: pack.id,
    taskId: task.id,
    taskText: task.text,
    ruleA: ruleOf(pack, label.ruleA),
    ruleB: ruleOf(pack, label.ruleB),
    prompt: new PackEval.JudgePrompt({
      criterion: prompt.criterion,
      passDefinition: prompt.passDefinition,
      failDefinition: prompt.failDefinition,
      fewShotPairIds: prompt.fewShotPairIds,
    }),
    fewShot: prompt.fewShotPairIds.map((id) => {
      const fewShot = world.pairLabels.find((entry) => entry.id === id)
      if (fewShot === undefined) throw new Error(`the judge world holds no pair ${id}`)
      return exampleOf(world, pack.id, fewShot)
    }),
  })
}

const answerTextOf = Schema.encodeEffect(Schema.fromJsonString(PackEval.JudgeReply))

const completionOf = (content: string): LoopbackReply => ({
  status: 200,
  body: {
    id: 'contradiction-judge-loopback',
    object: 'chat.completion',
    created: 1_760_000_000,
    model: servedModel,
    system_fingerprint: null,
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
  },
})

const judgedReplyOf = (
  critique: string,
  verdict: PackEval.JudgeVerdict,
): Effect.Effect<LoopbackReply, Schema.SchemaError> => Effect.map(answerTextOf({ critique, verdict }), completionOf)

const verdictlessReply: LoopbackReply = completionOf('{"verdict":"Fail"}')

interface JudgeWorld {
  readonly provider: OpenRouterLoopbackShape
  readonly cacheDir: string
  readonly request: PackEval.ContradictionJudgeRequest
}

const scriptedWorldOf = (world: World, replies: ReadonlyArray<LoopbackReply>) =>
  Effect.gen(function*() {
    const provider = yield* OpenRouterLoopback
    const fileSystem = yield* FileSystem.FileSystem
    yield* provider.answerWith(replies)
    const cacheDir = yield* fileSystem.makeTempDirectoryScoped()
    return { provider, cacheDir, request: judgeRequestOf(world) } satisfies JudgeWorld
  })

const stackOf = (world: JudgeWorld, model: string) =>
  Layer.provideMerge(
    Layer.provideMerge(
      Layer.provideMerge(
        PackEval.OpenRouterContradictionJudge.layer({ model }),
        PackEval.FileAnswerCache.layer({ cacheDir: world.cacheDir }),
      ),
      OpenRouterLanguageModel.layer({ model }),
    ),
    OpenRouterClient.layer({ apiUrl: world.provider.apiUrl, apiKey: Redacted.make('sk-loopback') }),
  )

const judgeWith = (world: JudgeWorld, model: string) =>
  Effect.gen(function*() {
    const judge = yield* PackEval.ContradictionJudge
    return yield* judge.judge(world.request)
  }).pipe(Effect.provide(stackOf(world, model)))

const questionOf = (requests: ReadonlyArray<RecordedRequest>): string => requests[0]?.text ?? ''

const judgedRows = [
  { reply: 'a Fail with its critique', verdictless: false },
  { reply: 'a verdict with no critique', verdictless: true },
] as const

const cachedRows = [
  { models: 'the same model twice', first: 'acme/judge-large', second: 'acme/judge-large' },
  { models: 'two different models', first: 'acme/judge-large', second: 'acme/judge-small' },
] as const

Feature('Asking whether two rules can be satisfied together')
  .withScenarioLayer(openRouterLoopback)
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'A clash answered with <reply> is judged or refused',
      judgedRows,
      (row) =>
        Gherkin.Do.pipe(
          Given('a clashing rule pair, a task needing both, and a remembered clash')(
            'world',
            () =>
              Effect.flatMap(
                judgedReplyOf(
                  'Hourly venting opens the vents the sealed-ripening rule keeps shut.',
                  'Fail',
                ),
                (judged) => scriptedWorldOf(contradictionJudgeWorld(), row.verdictless ? [verdictlessReply] : [judged]),
              ),
          ),
          When('the judge is asked whether one change satisfies both')('outcome', (s) =>
            Effect.gen(function*() {
              const attempt = yield* Effect.result(judgeWith(s.world, askedModel))
              const asked = yield* s.world.provider.requests
              return { attempt, asked }
            })),
          Then('the question carries the task, both bodies, the remembered clash, and the criterion')((s) => {
            const question = questionOf(s.outcome.asked)
            const request = s.world.request
            expect(question).toContain(request.taskText)
            expect(question).toContain(request.ruleA.body)
            expect(question).toContain(request.ruleB.body)
            for (const example of request.fewShot) {
              expect(question).toContain(example.ruleBBody)
              expect(question).toContain(example.critique)
            }
            expect(question).toContain(request.prompt.criterion)
          }),
          Then('the verdict, or the refusal, matches the scripted reply')((s) =>
            Match.value(row.verdictless).pipe(
              Match.when(false, () => {
                const judged = Result.getOrThrow(s.outcome.attempt)
                expect(judged.verdict).toBe('Fail')
                expect(judged.critique).toContain('Hourly venting')
                expect(judged.servedModel).toBe(servedModel)
              }),
              Match.when(true, () => {
                const refusal = Result.getOrThrow(Result.flip(s.outcome.attempt))
                expect(refusal).toMatchObject({ _tag: 'JudgeFailure', role: 'judge', model: askedModel })
              }),
              Match.exhaustive,
            )
          ),
        ),
    )

    scenarioOutline(
      'The same clash asked under <models> reaches the provider once per model',
      cachedRows,
      (row) =>
        Gherkin.Do.pipe(
          Given('a provider answering Fail, with answers kept in a scratch folder')(
            'world',
            () =>
              Effect.flatMap(
                judgedReplyOf(
                  'Hourly venting opens the vents the sealed-ripening rule keeps shut.',
                  'Fail',
                ),
                (judged) => scriptedWorldOf(contradictionJudgeWorld(), [judged]),
              ),
          ),
          When('the same clash is asked under the first model and then the second')('outcome', (s) =>
            Effect.gen(function*() {
              const first = yield* judgeWith(s.world, row.first)
              const second = yield* judgeWith(s.world, row.second)
              const asked = yield* s.world.provider.requestCount
              return { first, second, asked }
            })),
          Then('the provider was reached once per distinct model, and the answers agree where they should')((s) => {
            const expected = row.first === row.second ? 1 : 2
            expect(s.outcome.asked).toBe(expected)
            if (row.first === row.second) {
              expect(s.outcome.second).toEqual(s.outcome.first)
            } else {
              expect(s.outcome.second.servedModel).toBe(servedModel)
            }
          }),
        ),
    )
  })
