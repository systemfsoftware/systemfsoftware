import { OpenRouterClient, OpenRouterLanguageModel } from '@effect/ai-openrouter'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect, Layer, Match, Redacted, Result, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { expect } from 'vitest'
import {
  completionReplyOf,
  type LoopbackReply,
  OpenRouterLoopback,
  openRouterLoopback,
  type OpenRouterLoopbackShape,
  type RecordedRequest,
} from './__fixtures__/openrouter-loopback.fixture.js'
import {
  ruleSelectorWorld,
  type World,
  type WorldInstruction,
  type WorldPack,
  type WorldTask,
} from './__fixtures__/pack-eval-world.fixture.js'

const Feature = makeFeature({ it, layer })

const askedModel = 'acme/planner-large'
const servedModel = 'acme/planner-large@acme'

const headOf = <T>(values: ReadonlyArray<T>, what: string): T => {
  const [first] = values
  if (first === undefined) throw new Error(`the selector world holds no ${what}`)
  return first
}

const packOf = (world: World): WorldPack => headOf(world.packs, 'pack')
const taskOf = (world: World): WorldTask => headOf(world.tasks, 'task')

const instructionOf = (world: World): WorldInstruction => {
  const instruction = world.instruction
  if (instruction === undefined) throw new Error('the selector world holds no instruction')
  return instruction
}

const ruleRequestOf = (world: World): PackEval.RuleSelectionRequest => {
  const pack = packOf(world)
  const task = taskOf(world)
  const instruction = instructionOf(world)
  return {
    pack: new PackEval.Pack({
      id: pack.id,
      rules: pack.rules.map((rule) =>
        new PackEval.PackRule({
          packId: pack.id,
          stem: rule.stem,
          title: rule.title,
          appliesWhen: [headOf(rule.appliesWhen, 'applies_when'), ...rule.appliesWhen.slice(1)],
          tags: rule.tags,
          body: rule.body,
        })
      ),
    }),
    task: new PackEval.Task({ id: task.id, text: task.text, split: task.split, dimensions: task.dimensions }),
    instruction: new PackEval.SelectorInstruction({
      text: instruction.text,
      provenance: new PackEval.SelectorProvenance({
        consumer: instruction.consumer,
        pluginVersion: instruction.pluginVersion,
        sourcePath: instruction.sourcePath,
      }),
    }),
  }
}

const answerTextOf = Schema.encodeEffect(Schema.fromJsonString(PackEval.LoadedStems))

const answerOf = (content: string): LoopbackReply => completionReplyOf({ content, servedModel })
type ReplyKind = 'answered' | 'refused'

const refusedReply: LoopbackReply = {
  status: 500,
  body: { error: { message: 'upstream is down' } },
}

const replyOf = (kind: ReplyKind, stems: ReadonlyArray<string>): Effect.Effect<LoopbackReply, Schema.SchemaError> =>
  Match.value(kind).pipe(
    Match.when('answered', () => Effect.map(answerTextOf({ loaded: stems }), answerOf)),
    Match.when('refused', () => Effect.succeed(refusedReply)),
    Match.exhaustive,
  )

interface SelectorWorld {
  readonly provider: OpenRouterLoopbackShape
  readonly cacheDir: string
  readonly request: PackEval.RuleSelectionRequest
}
const scriptedWorldOf = (world: World, kind: ReplyKind, stems: ReadonlyArray<string>) =>
  Effect.gen(function*() {
    const provider = yield* OpenRouterLoopback
    const fileSystem = yield* FileSystem.FileSystem
    yield* provider.answerWith([yield* replyOf(kind, stems)])
    const cacheDir = yield* fileSystem.makeTempDirectoryScoped()
    return { provider, cacheDir, request: ruleRequestOf(world) } satisfies SelectorWorld
  })

const stackOf = (world: SelectorWorld, model: string) =>
  Layer.provideMerge(
    Layer.provideMerge(
      Layer.provideMerge(
        PackEval.OpenRouterRuleSelector.layer({ model }),
        PackEval.FileAnswerCache.layer({ cacheDir: world.cacheDir }),
      ),
      OpenRouterLanguageModel.layer({ model }),
    ),
    OpenRouterClient.layer({ apiUrl: world.provider.apiUrl, apiKey: Redacted.make('sk-loopback') }),
  )

const selectWith = (world: SelectorWorld, model: string) =>
  Effect.gen(function*() {
    const selector = yield* PackEval.RuleSelector
    return yield* selector.select(world.request)
  }).pipe(Effect.provide(stackOf(world, model)))

const promptOf = (requests: ReadonlyArray<RecordedRequest>): string => requests[0]?.text ?? ''

const repliedRows = [
  { reply: 'selected stems', kind: 'answered', stems: ['watering-schedule'] },
  { reply: 'a stem the pack does not hold', kind: 'answered', stems: ['compost-tea'] },
  { reply: 'a provider refusal', kind: 'refused', stems: [] },
] as const

const cachedRows = [
  { models: 'the same model twice', first: 'acme/planner-large', second: 'acme/planner-large' },
  { models: 'two different models', first: 'acme/planner-large', second: 'acme/planner-small' },
] as const

Feature('Deciding which pack rules govern a piece of work')
  .withScenarioLayer(openRouterLoopback)
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'An answer with <reply> is carried, refused, or reported',
      repliedRows,
      (row) =>
        Gherkin.Do.pipe(
          Given('a pack, a task, and a scripted provider answer')(
            'world',
            () => scriptedWorldOf(ruleSelectorWorld(), row.kind, [...row.stems]),
          ),
          When('the selector is asked which rules govern the task')('outcome', (s) =>
            Effect.gen(function*() {
              const attempt = yield* Effect.result(selectWith(s.world, askedModel))
              const asked = yield* s.world.provider.requests
              return { attempt, asked }
            })),
          Then('the question carries the instruction, the rule keys, the task, and never a rule body')((s) => {
            const question = promptOf(s.outcome.asked)
            const request = s.world.request
            expect(question).toContain(request.instruction.text)
            for (const rule of request.pack.rules) {
              expect(question).toContain(rule.title)
              for (const applies of rule.appliesWhen) {
                expect(question).toContain(applies)
              }
              expect(question).not.toContain(rule.body)
            }
            expect(question).toContain(request.task.text)
          }),
          Then('the answer, refusal, or report matches the scripted reply')((s) =>
            Match.value(row.reply).pipe(
              Match.when('selected stems', () => {
                const selection = Result.getOrThrow(s.outcome.attempt)
                expect(selection.loadedStems).toEqual([...row.stems])
                expect(selection.servedModel).toBe(servedModel)
                expect(selection.requestedModel).toBe(askedModel)
              }),
              Match.when('a stem the pack does not hold', () => {
                const refusal = Result.getOrThrow(Result.flip(s.outcome.attempt))
                expect(refusal).toMatchObject({
                  _tag: 'UnknownSelectedStem',
                  stem: 'compost-tea',
                  packId: 'greenhouse',
                })
              }),
              Match.when('a provider refusal', () => {
                const refusal = Result.getOrThrow(Result.flip(s.outcome.attempt))
                expect(refusal).toMatchObject({ _tag: 'ProviderFailure', role: 'selector', model: askedModel })
                expect(refusal).not.toMatchObject({ _tag: 'UnknownSelectedStem' })
              }),
              Match.exhaustive,
            )
          ),
        ),
    )

    scenarioOutline(
      'The same work asked under <models> keeps one answer per model',
      cachedRows,
      (row) =>
        Gherkin.Do.pipe(
          Given('a provider scripted once, and answers kept in a scratch folder')(
            'world',
            () => scriptedWorldOf(ruleSelectorWorld(), 'answered', ['watering-schedule']),
          ),
          When('the work is asked under the first model and then the second')('outcome', (s) =>
            Effect.gen(function*() {
              const first = yield* selectWith(s.world, row.first)
              const second = yield* selectWith(s.world, row.second)
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
