import { OpenRouterClient, OpenRouterLanguageModel } from '@effect/ai-openrouter'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect, Layer, Redacted, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { expect } from 'vitest'
import {
  type LoopbackReply,
  OpenRouterLoopback,
  openRouterLoopback,
  type OpenRouterLoopbackShape,
  type RecordedRequest,
} from './__fixtures__/openrouter-loopback.fixture.js'

const Feature = makeFeature({ it, layer })

const judgePrompt = new PackEval.JudgePrompt({
  criterion: 'On this task, can one change satisfy both rules?',
  passDefinition: 'Pass: one change can satisfy both rules at once.',
  failDefinition: 'Fail: no single change satisfies both rules together.',
  fewShotPairIds: ['pair-seen'],
})

const fewShot: ReadonlyArray<PackEval.FewShotExample> = [
  new PackEval.FewShotExample({
    taskText: 'Cool the ripening room before the weekend',
    ruleABody: 'Vent the room every hour while the fruit ripens.',
    ruleBBody: 'Keep every vent sealed while the room holds fruit.',
    verdict: 'Fail',
    critique: 'The bodies order opposite vent settings for the same room, so no single change satisfies both.',
  }),
]

const request: PackEval.ContradictionJudgeRequest = new PackEval.ContradictionJudgeRequest({
  packId: 'greenhouse',
  taskId: 'task-cool',
  taskText: 'Cool the ripening room before the weekend',
  ruleA: new PackEval.ContradictionJudgeRule({
    stem: 'hourly-venting',
    title: 'Vent while ripening',
    body: 'Vent the room every hour while the fruit ripens.',
  }),
  ruleB: new PackEval.ContradictionJudgeRule({
    stem: 'sealed-ripening',
    title: 'Seal while holding fruit',
    body: 'Keep every vent sealed while the room holds fruit.',
  }),
  prompt: judgePrompt,
  fewShot,
})

const askedModel = 'acme/judge-large'
const servedModel = 'acme/judge-large@acme'

const answerTextOf = Schema.encodeEffect(Schema.fromJsonString(PackEval.JudgeReply))

const judgeReply = (
  reply: PackEval.JudgeReply,
): Effect.Effect<LoopbackReply, Schema.SchemaError> =>
  Effect.map(answerTextOf(reply), (content) => ({
    status: 200,
    body: {
      id: 'gen-loopback-1',
      object: 'chat.completion',
      created: 1_760_000_000,
      model: servedModel,
      system_fingerprint: null,
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
    },
  }))

const answerTextReply = (content: string): LoopbackReply => ({
  status: 200,
  body: {
    id: 'gen-loopback-1',
    object: 'chat.completion',
    created: 1_760_000_000,
    model: servedModel,
    system_fingerprint: null,
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
  },
})

interface World {
  readonly provider: OpenRouterLoopbackShape
  readonly cacheDir: string
}

const worldWith = (replies: ReadonlyArray<LoopbackReply>) =>
  Effect.gen(function*() {
    const provider = yield* OpenRouterLoopback
    const fileSystem = yield* FileSystem.FileSystem
    yield* provider.answerWith(replies)
    const cacheDir = yield* fileSystem.makeTempDirectoryScoped()
    return { provider, cacheDir } satisfies World
  })

const judgeStack = (world: World, model: string) =>
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

const judgeOnce = (world: World, model: string) =>
  Effect.gen(function*() {
    const judge = yield* PackEval.ContradictionJudge
    return yield* judge.judge(request)
  }).pipe(Effect.provide(judgeStack(world, model)))

const questionOf = (requests: ReadonlyArray<RecordedRequest>): string => requests[0]?.text ?? ''

Feature('Asking whether two rules can be satisfied together')
  .withScenarioLayer(openRouterLoopback)
  .body(({ scenario }) => {
    scenario(
      'Two rules that clash on the ripening room go to the provider with their history',
      Gherkin.Do.pipe(
        Given('a venting rule and a sealing rule that a cooling task needs together')(
          'world',
          () =>
            Effect.flatMap(
              judgeReply({
                critique: 'Hourly venting opens the vents the sealed-ripening rule keeps shut.',
                verdict: 'Fail',
              }),
              (reply) => worldWith([reply]),
            ),
        ),
        When('the judge is asked whether one change satisfies both')('outcome', (scope) =>
          Effect.gen(function*() {
            const judged = yield* judgeOnce(scope.world, askedModel)
            const asked = yield* scope.world.provider.requests
            return { judged, asked }
          })),
        Then('the question carries the task, both bodies, and the remembered clash')((scope) => {
          const question = questionOf(scope.outcome.asked)
          expect(question).toContain(request.taskText)
          expect(question).toContain(request.ruleA.body)
          expect(question).toContain(request.ruleB.body)
          expect(question).toContain(fewShot[0]?.ruleBBody ?? '')
          expect(question).toContain(fewShot[0]?.critique ?? '')
          expect(question).toContain(judgePrompt.criterion)
        }),
        Then('the critique comes back first with the verdict and the served model')((scope) => {
          expect(scope.outcome.judged.verdict).toBe('Fail')
          expect(scope.outcome.judged.critique).toContain('Hourly venting')
          expect(scope.outcome.judged.servedModel).toBe(servedModel)
        }),
      ),
    )

    scenario(
      'A reply with no critique is refused as a provider failure',
      Gherkin.Do.pipe(
        Given('a provider answering with a verdict but no critique')(
          'world',
          () => worldWith([answerTextReply('{"verdict":"Fail"}')]),
        ),
        When('the judge is asked whether one change satisfies both')(
          'refusal',
          (scope) => Effect.flip(judgeOnce(scope.world, askedModel)),
        ),
        Then('the refusal names the provider and the model that was asked')((scope) => {
          expect(scope.refusal).toMatchObject({ _tag: 'JudgeFailure', role: 'judge', model: askedModel })
        }),
      ),
    )

    scenario(
      'Asking about the same clash twice reaches the provider once',
      Gherkin.Do.pipe(
        Given('a provider answering Fail, with answers kept in a scratch folder')(
          'world',
          () =>
            Effect.flatMap(
              judgeReply({
                critique: 'Hourly venting opens the vents the sealed-ripening rule keeps shut.',
                verdict: 'Fail',
              }),
              (reply) => worldWith([reply]),
            ),
        ),
        When('the same clash is asked twice')('second', (scope) =>
          Effect.gen(function*() {
            const first = yield* judgeOnce(scope.world, askedModel)
            const again = yield* judgeOnce(scope.world, askedModel)
            const asked = yield* scope.world.provider.requestCount
            return { first, again, asked }
          })),
        Then('the provider is asked once, and both answers agree')((scope) => {
          expect(scope.second.asked).toBe(1)
          expect(scope.second.again).toEqual(scope.second.first)
        }),
      ),
    )
  })
