import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect } from 'effect'
import { expect } from 'vitest'
import {
  compostingRule,
  decodeReply,
  mulchingRule,
  outsideProbeExists,
  pairLabelsFileExists,
  placeOutsideProbe,
  readPairLabels,
  ReviewFixture,
  reviewPackId,
  reviewServerFixture,
  type TextReply,
  textRequest,
  ventingRule,
  wateringRule,
  wateringStem,
  writeLabels,
  writePackRules,
  writeTaskSet,
  writeTrace,
} from './__fixtures__/review-server.fixture.js'

const Feature = makeFeature({ it, layer })

const pruningTask = new PackEval.Task({
  id: 'task-prune',
  text: 'Prune the tomato shoots before the weekend',
  split: 'dev',
  dimensions: { job: 'pruning', pace: 'steady' },
})

const oneTaskSet = new PackEval.TaskSet({ version: 1, tasks: [pruningTask] })

const dualGoverningLabels = new PackEval.RoutingLabels({
  version: 1,
  entries: [
    new PackEval.RoutingLabelEntry({
      taskId: pruningTask.id,
      packId: reviewPackId,
      governing: [wateringRule.stem, ventingRule.stem],
      deferred: [],
    }),
  ],
})

const singleGoverningLabels = new PackEval.RoutingLabels({
  version: 1,
  entries: [
    new PackEval.RoutingLabelEntry({
      taskId: pruningTask.id,
      packId: reviewPackId,
      governing: [wateringRule.stem],
      deferred: [],
    }),
  ],
})

const wateringFirstPairs = (taskId: string) =>
  new PackEval.RoutingLabels({
    version: 1,
    entries: [
      new PackEval.RoutingLabelEntry({
        taskId,
        packId: reviewPackId,
        governing: [wateringRule.stem, ventingRule.stem, compostingRule.stem, mulchingRule.stem],
        deferred: [],
      }),
    ],
  })

const pairPathOf = (taskId: string): string => `/api/tasks/${taskId}/pairs?pack=${reviewPackId}`

const pairsPathOf = (taskId: string): string => `/api/tasks/${taskId}/pairs`

const decodeSaved = (reply: TextReply) => decodeReply(PackEval.ReviewPairSaved)(reply)

const decodePairs = (reply: TextReply) => decodeReply(PackEval.ReviewPairList)(reply)

const splitByPairId = (labels: PackEval.PairLabels): Readonly<Record<string, string>> =>
  Object.fromEntries(labels.entries.map((entry) => [entry.id, entry.split]))

Feature('Labelling whether one change can satisfy two rules on a task')
  .withScenarioLayer(reviewServerFixture)
  .body(({ scenario }) => {
    scenario(
      'A labelled pair is kept with its origin and split, and read back on the next call',
      Gherkin.Do.pipe(
        Given('a pruning task whose routing needs the watering and venting rules')(
          'world',
          () =>
            Effect.gen(function*() {
              const world = yield* ReviewFixture
              yield* writePackRules({ world, rules: [wateringRule, ventingRule] })
              yield* writeTaskSet({ world, tasks: oneTaskSet })
              yield* writeLabels({ world, labels: dualGoverningLabels })
              return world
            }),
        ),
        When('the owner says one change satisfies both rules')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const savedReply = yield* textRequest({
                world: s.world,
                method: 'PUT',
                path: pairPathOf(pruningTask.id),
                body: {
                  ruleA: wateringRule.stem,
                  ruleB: ventingRule.stem,
                  verdict: 'Pass',
                  origin: 'observed',
                  notes: 'one walk-through covers both',
                },
              })
              const seenReply = yield* textRequest({
                world: s.world,
                method: 'GET',
                path: pairsPathOf(pruningTask.id),
              })
              const saved = yield* decodeSaved(savedReply)
              const seen = yield* decodePairs(seenReply)
              const stored = yield* readPairLabels(s.world)
              return { savedReply, seenReply, saved, seen, stored }
            }),
        ),
        Then('the label is stored with its origin, verdict, and split')((s) => {
          expect(s.outcome.savedReply.body).toContain(pruningTask.id)
          expect(s.outcome.savedReply.body).toContain(`${reviewPackId}:${ventingRule.stem}:${wateringRule.stem}`)
          expect(s.outcome.savedReply.status === 200 ? s.outcome.saved : null).toMatchObject({
            pairId: `${reviewPackId}:${ventingRule.stem}:${wateringRule.stem}`,
            taskId: pruningTask.id,
            packId: reviewPackId,
            verdict: 'Pass',
            origin: 'observed',
          })
          expect(s.outcome.stored.entries).toHaveLength(1)
          expect(s.outcome.stored.entries[0]).toMatchObject({
            taskId: pruningTask.id,
            packId: reviewPackId,
            ruleA: wateringRule.stem,
            ruleB: ventingRule.stem,
            verdict: 'Pass',
            origin: 'observed',
            notes: 'one walk-through covers both',
          })
          expect(s.outcome.stored.entries[0]?.split).toBe(s.outcome.saved.split)
        }),
        Then('the next read shows the same pair with both rule bodies')((s) => {
          expect(s.outcome.seenReply.body).toContain(wateringRule.body.trim())
          expect(s.outcome.seenReply.body).toContain(ventingRule.body.trim())
          expect(s.outcome.seen.pairs).toHaveLength(1)
          expect(s.outcome.seen.pairs[0]).toMatchObject({
            taskId: pruningTask.id,
            packId: reviewPackId,
            verdict: 'Pass',
            origin: 'observed',
          })
          expect(s.outcome.seen.pairs[0]?.ruleA.body.trim()).toBe(wateringRule.body)
          expect(s.outcome.seen.pairs[0]?.ruleB.body.trim()).toBe(ventingRule.body)
        }),
      ),
    )

    scenario(
      'A labelled pack of pairs lands in train, dev, and test with both verdicts each side',
      Gherkin.Do.pipe(
        Given('a task needing four rules, so six witnessable pairs')(
          'world',
          () =>
            Effect.gen(function*() {
              const world = yield* ReviewFixture
              yield* writePackRules({ world, rules: [wateringRule, ventingRule, compostingRule, mulchingRule] })
              yield* writeTaskSet({ world, tasks: oneTaskSet })
              yield* writeLabels({ world, labels: wateringFirstPairs(pruningTask.id) })
              return world
            }),
        ),
        When('the owner labels three pairs Pass and three pairs Fail')(
          'stored',
          (s) =>
            Effect.gen(function*() {
              const stems = [wateringRule.stem, ventingRule.stem, compostingRule.stem, mulchingRule.stem]
              const requests = stems.flatMap((stem, index) =>
                stems.slice(index + 1).map((later) => ({ ruleA: stem, ruleB: later }))
              )
              yield* Effect.forEach(requests, (request, index) =>
                textRequest({
                  world: s.world,
                  method: 'PUT',
                  path: pairPathOf(pruningTask.id),
                  body: {
                    ruleA: request.ruleA,
                    ruleB: request.ruleB,
                    verdict: index < 3 ? 'Pass' : 'Fail',
                    origin: 'observed',
                    notes: '',
                  },
                }), { discard: true })
              return yield* readPairLabels(s.world)
            }),
        ),
        Then('the file holds all six pairs, each in train, dev, or test')((s) => {
          expect(s.stored.entries).toHaveLength(6)
          const splits = splitByPairId(s.stored)
          for (const entry of s.stored.entries) {
            expect(['train', 'dev', 'test']).toContain(splits[entry.id])
          }
          expect(Object.values(splits)).toContain('train')
          expect(Object.values(splits)).toContain('dev')
          expect(Object.values(splits)).toContain('test')
        }),
        Then('dev and test each carry a Pass and a Fail')((s) => {
          const verdictIn = (split: string) =>
            s.stored.entries.filter((entry) => entry.split === split).map((entry) => entry.verdict)
          expect(verdictIn('dev')).toContain('Pass')
          expect(verdictIn('dev')).toContain('Fail')
          expect(verdictIn('test')).toContain('Pass')
          expect(verdictIn('test')).toContain('Fail')
        }),
      ),
    )

    scenario(
      'A pair the task does not witness is refused and nothing is written',
      Gherkin.Do.pipe(
        Given('a pruning task needing the watering rule alone, and no pair file')(
          'world',
          () =>
            Effect.gen(function*() {
              const world = yield* ReviewFixture
              yield* writePackRules({ world, rules: [wateringRule, ventingRule] })
              yield* writeTaskSet({ world, tasks: oneTaskSet })
              yield* writeLabels({ world, labels: singleGoverningLabels })
              return world
            }),
        ),
        When('the owner labels a pair needing both rules')(
          'unwitnessed',
          (s) =>
            Effect.gen(function*() {
              const reply = yield* textRequest({
                world: s.world,
                method: 'PUT',
                path: pairPathOf(pruningTask.id),
                body: {
                  ruleA: wateringRule.stem,
                  ruleB: ventingRule.stem,
                  verdict: 'Pass',
                  origin: 'observed',
                  notes: '',
                },
              })
              return { reply, written: yield* pairLabelsFileExists(s.world) }
            }),
        ),
        When('the owner names a rule the pack does not hold')(
          'unknown',
          (s) =>
            Effect.gen(function*() {
              const reply = yield* textRequest({
                world: s.world,
                method: 'PUT',
                path: pairPathOf(pruningTask.id),
                body: {
                  ruleA: wateringRule.stem,
                  ruleB: 'compost-tea',
                  verdict: 'Pass',
                  origin: 'observed',
                  notes: '',
                },
              })
              return { reply, written: yield* pairLabelsFileExists(s.world) }
            }),
        ),
        When('the owner plants a pair without its rewritten body')(
          'planted',
          (s) =>
            Effect.gen(function*() {
              yield* writeLabels({ world: s.world, labels: dualGoverningLabels })
              const reply = yield* textRequest({
                world: s.world,
                method: 'PUT',
                path: pairPathOf(pruningTask.id),
                body: {
                  ruleA: wateringRule.stem,
                  ruleB: ventingRule.stem,
                  verdict: 'Fail',
                  origin: 'planted',
                  notes: '',
                },
              })
              return { reply, written: yield* pairLabelsFileExists(s.world) }
            }),
        ),
        Then('the unwitnessed pair is refused naming both rules, and no file appears')((s) => {
          expect(s.unwitnessed.reply.body).toContain('does not label both rules as governing')
          expect(s.unwitnessed.reply.body).toContain(wateringRule.stem)
          expect(s.unwitnessed.reply.body).toContain(ventingRule.stem)
          expect(s.unwitnessed.written).toBe(false)
        }),
        Then('the unknown rule is refused naming the stem, and no file appears')((s) => {
          expect(s.unknown.reply.body).toContain('unknown stem')
          expect(s.unknown.reply.body).toContain('compost-tea')
          expect(s.unknown.written).toBe(false)
        }),
        Then('the bodyless planted pair is refused, and no file appears')((s) => {
          expect(s.planted.reply.body).toContain('planted pair needs a body')
          expect(s.planted.written).toBe(false)
        }),
      ),
    )

    scenario(
      'A task id carrying slashes and dots keeps its trace inside the work dir',
      Gherkin.Do.pipe(
        Given('a traced task whose id walks up and across directories')(
          'world',
          () =>
            Effect.gen(function*() {
              const world = yield* ReviewFixture
              const task = new PackEval.Task({
                id: 'task-../outside/../../probe',
                text: 'Sweep the paths after the storm',
                split: 'dev',
                dimensions: { job: 'paths', pace: 'steady' },
              })
              yield* writePackRules({ world, rules: [wateringRule, ventingRule] })
              yield* writeTaskSet({ world, tasks: new PackEval.TaskSet({ version: 1, tasks: [task] }) })
              yield* writeLabels({
                world,
                labels: new PackEval.RoutingLabels({
                  version: 1,
                  entries: [
                    new PackEval.RoutingLabelEntry({
                      taskId: task.id,
                      packId: reviewPackId,
                      governing: [wateringStem],
                      deferred: [],
                    }),
                  ],
                }),
              })
              yield* placeOutsideProbe({ base: world.workDir, relative: 'traces/probe' })
              yield* writeTrace({ world, taskId: task.id, loadedStems: [wateringStem] })
              return { world, task }
            }),
        ),
        When('the page is asked for the task')(
          'view',
          (s) =>
            Effect.gen(function*() {
              const reply = yield* textRequest({
                world: s.world.world,
                method: 'GET',
                path: `/api/tasks/${encodeURIComponent(s.world.task.id)}`,
              })
              const textDecode = yield* decodeReply(PackEval.ReviewTaskView)(reply)
              const probe = yield* outsideProbeExists({ base: s.world.world.workDir, relative: 'traces/probe' })
              return { reply, view: textDecode, probe }
            }),
        ),
        Then('the selector output shows, and the marker outside traces/ is untouched')((s) => {
          expect(s.view.view.packs[0]?.traceLoadedStems).toEqual([wateringStem])
          expect(s.view.probe).toBe(true)
        }),
      ),
    )
  })
