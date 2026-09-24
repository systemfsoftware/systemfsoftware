import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect } from 'effect'
import { expect } from 'vitest'
import {
  reviewWorld,
  stemPairsOf,
  witnessedPairsOf,
  type World,
  type WorldRuleFile,
  type WorldTask,
} from './__fixtures__/pack-eval-world.fixture.js'
import {
  decodeReply,
  markerTextOf,
  pairLabelsTextOf,
  pairsPathOf,
  requiredElementOf,
  ReviewFixture,
  type ReviewLocations,
  reviewPackId,
  reviewServerFixture,
  taskPathOf,
  textRequest,
  writeMarkerOf,
  writeWorld,
} from './__fixtures__/review-server.fixture.js'

const Feature = makeFeature({ it, layer })

const greenhouse = reviewWorld()

const packOf = (options: { readonly world: World; readonly packId: string }): World['packs'][number] =>
  requiredElementOf({
    values: options.world.packs.filter((pack) => pack.id === options.packId),
    index: 0,
    what: `the ${options.packId} pack`,
  })
const compareStrings = (left: string | undefined, right: string | undefined): number =>
  Number((left ?? '') > (right ?? '')) - Number((left ?? '') < (right ?? ''))

const witnessed = requiredElementOf({ values: witnessedPairsOf(greenhouse), index: 0, what: 'a witnessed pair' })

const witnessTaskId: string = requiredElementOf({
  values: witnessed.taskIds,
  index: 0,
  what: 'a task witnessing the pair',
})

const unwitnessedTaskId: string = requiredElementOf({
  values: greenhouse.tasks.map((task) => task.id).filter((id) => witnessed.taskIds.includes(id) === false),
  index: 0,
  what: 'a task outside the witnessed pair',
})

const ghostStem = 'compost-tea'

interface PairVerdict {
  readonly taskId: string
  readonly ruleA: string
  readonly ruleB: string
  readonly verdict: 'Pass' | 'Fail'
  readonly origin: 'observed' | 'planted'
  readonly notes: string
  readonly names: ReadonlyArray<string>
}

const haulingRule: WorldRuleFile = {
  stem: 'cart-hauling',
  title: 'Haul the cart by hand',
  appliesWhen: ['moving soil by the cart'],
  tags: ['soil'],
  body: 'Push the cart by the handles and mind the ruts.',
}

const packOfFour = {
  id: reviewPackId,
  rules: [...packOf({ world: greenhouse, packId: reviewPackId }).rules, haulingRule],
}

const splitWorld: World = reviewWorld({
  packs: [packOfFour],
  routingLabels: [
    {
      taskId: witnessTaskId,
      packId: reviewPackId,
      governing: packOfFour.rules.map((rule) => rule.stem),
      deferred: [],
    },
  ],
  pairLabels: [],
})

const splitRequests: ReadonlyArray<PairVerdict> = stemPairsOf(packOfFour).flatMap(([ruleA, ruleB], pairIndex) => [
  {
    taskId: witnessTaskId,
    ruleA,
    ruleB,
    verdict: pairIndex < 3 ? 'Pass' : 'Fail',
    origin: 'observed',
    notes: `${ruleA} beside ${ruleB}`,
    names: [],
  },
])

const escapingTaskId = 'task-../outside/../../probe'

const escapingTask: WorldTask = {
  id: escapingTaskId,
  text: 'Sweep the paths after the storm',
  split: 'dev',
  dimensions: { job: 'paths', pace: 'steady' },
}

const escapingTrace = {
  ...requiredElementOf({
    values: greenhouse.traces.filter((trace) => trace.packId === reviewPackId),
    index: 0,
    what: 'a recorded trace',
  }),
  taskId: escapingTaskId,
}

const escapingWorld: World = reviewWorld({
  tasks: [...greenhouse.tasks, escapingTask],
  routingLabels: [
    ...greenhouse.routingLabels,
    {
      taskId: escapingTaskId,
      packId: reviewPackId,
      governing: escapingTrace.loadedStems,
      deferred: [],
    },
  ],
  traces: [...greenhouse.traces, escapingTrace],
})

const markerRelative = `traces/${reviewPackId}/probe.json`

const markerPlanted = JSON.stringify({ ...escapingTrace, loadedStems: ['marker'] })

const writeScenarioOf = (world: World) =>
  Effect.gen(function*() {
    const locations = yield* ReviewFixture
    yield* writeWorld({ locations, world })
    return { locations, world }
  })

const fetchedPairsOf = (options: { readonly locations: ReviewLocations; readonly taskId: string }) =>
  Effect.gen(function*() {
    const seenReply = yield* textRequest({
      locations: options.locations,
      method: 'GET',
      path: `${taskPathOf(options.taskId)}/pairs`,
    })
    return yield* decodeReply(PackEval.ReviewPairList)(seenReply)
  })

Feature('Labelling whether one change can satisfy two rules on a task')
  .withScenarioLayer(reviewServerFixture)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A labelled pair is kept with its origin and split, and read back on the next call',
      Gherkin.Do.pipe(
        Given('a pruning task whose routing needs the watering and pruning rules')(
          'scenario',
          () => writeScenarioOf(greenhouse),
        ),
        When('the owner says one change satisfies both rules')('outcome', (s) =>
          Effect.gen(function*() {
            const savedReply = yield* textRequest({
              locations: s.scenario.locations,
              method: 'PUT',
              path: pairsPathOf({ taskId: witnessTaskId, packId: reviewPackId }),
              body: {
                ruleA: witnessed.ruleA,
                ruleB: witnessed.ruleB,
                verdict: 'Pass',
                origin: 'observed',
                notes: 'one walk-through covers both',
              },
            })
            const saved = yield* decodeReply(PackEval.ReviewPairSaved)(savedReply)
            const seen = yield* fetchedPairsOf({ locations: s.scenario.locations, taskId: witnessTaskId })
            return { savedReply, saved, seen, pair: seen.pairs.filter((entry) => entry.pairId === saved.pairId) }
          })),
        Then('the label is stored with its origin, verdict, and split')((s) => {
          expect(s.outcome.savedReply.body).toContain(witnessTaskId)
          expect(s.outcome.saved).toMatchObject({
            pairId: `${reviewPackId}:${witnessed.ruleA}:${witnessed.ruleB}`,
            taskId: witnessTaskId,
            packId: reviewPackId,
            verdict: 'Pass',
            origin: 'observed',
          })
          expect(s.outcome.pair).toHaveLength(1)
          expect(s.outcome.pair[0]).toMatchObject({
            pairId: s.outcome.saved.pairId,
            verdict: 'Pass',
            origin: 'observed',
            split: s.outcome.saved.split,
            notes: 'one walk-through covers both',
          })
        }),
        Then('the next read shows the same pair with both rule bodies')((s) => {
          const bodies = packOf({ world: s.scenario.world, packId: reviewPackId })
            .rules.filter((rule) => [witnessed.ruleA, witnessed.ruleB].includes(rule.stem))
            .map((rule) => rule.body.trim())
            .toSorted(compareStrings)
          const seen = s.outcome.pair.flatMap((entry) => [entry.ruleA.body.trim(), entry.ruleB.body.trim()])
          expect(seen.toSorted(compareStrings)).toEqual(bodies)
        }),
      ),
    )

    scenario(
      'A labelled pack of pairs lands in train, dev, and test with both verdicts each side',
      Gherkin.Do.pipe(
        Given('a task whose routing needs four rules, so six witnessable pairs')(
          'scenario',
          () => writeScenarioOf(splitWorld),
        ),
        When('the owner labels three pairs Pass and three pairs Fail')('stored', (s) =>
          Effect.gen(function*() {
            yield* Effect.forEach(
              splitRequests,
              (request) =>
                textRequest({
                  locations: s.scenario.locations,
                  method: 'PUT',
                  path: pairsPathOf({ taskId: request.taskId, packId: reviewPackId }),
                  body: {
                    ruleA: request.ruleA,
                    ruleB: request.ruleB,
                    verdict: request.verdict,
                    origin: request.origin,
                    notes: request.notes,
                  },
                }),
              { discard: true },
            )
            return yield* fetchedPairsOf({ locations: s.scenario.locations, taskId: witnessTaskId })
          })),
        Then('the file holds all six pairs, each in train, dev, or test')((s) => {
          const splits = s.stored.pairs.map((entry) => entry.split)
          expect(s.stored.pairs).toHaveLength(splitRequests.length)
          expect([...new Set(splits)].toSorted(compareStrings)).toEqual(
            [...PackEval.PairSplit.literals].toSorted(compareStrings),
          )
        }),
        Then('dev and test each carry a Pass and a Fail')((s) => {
          const verdictIn = (split: string) =>
            s.stored.pairs.filter((entry) => entry.split === split).map((entry) => entry.verdict)
          expect(verdictIn('dev').toSorted(compareStrings)).toEqual(
            [...PackEval.JudgeVerdict.literals].toSorted(compareStrings),
          )
          expect(verdictIn('test').toSorted(compareStrings)).toEqual(
            [...PackEval.JudgeVerdict.literals].toSorted(compareStrings),
          )
        }),
      ),
    )

    scenarioOutline(
      'A pair label that <kind> is refused, and the pair file is left alone',
      [
        {
          kind: 'no task labels both rules as governing',
          taskId: unwitnessedTaskId,
          body: { ruleA: witnessed.ruleA, ruleB: witnessed.ruleB, verdict: 'Pass', origin: 'observed', notes: '' },
          names: [witnessed.ruleA, witnessed.ruleB],
        },
        {
          kind: 'names a stem the pack does not hold',
          taskId: witnessTaskId,
          body: { ruleA: witnessed.ruleA, ruleB: ghostStem, verdict: 'Pass', origin: 'observed', notes: '' },
          names: ['unknown stem', ghostStem],
        },
        {
          kind: 'plants a pair without its rewritten body',
          taskId: witnessTaskId,
          body: { ruleA: witnessed.ruleA, ruleB: witnessed.ruleB, verdict: 'Fail', origin: 'planted', notes: '' },
          names: ['a planted pair needs a body'],
        },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('a routing entry that the pair label must contradict')('scenario', () => writeScenarioOf(greenhouse)),
          When('the owner submits the pair label')('outcome', (s) =>
            Effect.gen(function*() {
              const before = yield* pairLabelsTextOf(s.scenario.locations)
              const reply = yield* textRequest({
                locations: s.scenario.locations,
                method: 'PUT',
                path: pairsPathOf({ taskId: row.taskId, packId: reviewPackId }),
                body: row.body,
              })
              const after = yield* pairLabelsTextOf(s.scenario.locations)
              return { before, after, reply }
            })),
          Then('the refusal names what the label got wrong')((s) => {
            for (const name of row.names) {
              expect(s.outcome.reply.body).toContain(name)
            }
          }),
          Then('the pair file is left exactly as it was')((s) => {
            expect(s.outcome.after).toBe(s.outcome.before)
          }),
        ),
    )

    scenario(
      'A task id carrying slashes and dots keeps its trace inside the work dir',
      Gherkin.Do.pipe(
        Given('a traced task whose id walks up and across directories')('scenario', () =>
          Effect.gen(function*() {
            const scenario = yield* writeScenarioOf(escapingWorld)
            yield* writeMarkerOf({ locations: scenario.locations, relative: markerRelative, content: markerPlanted })
            return scenario
          })),
        When('the page is asked for the task')('view', (s) =>
          Effect.gen(function*() {
            const taskId = escapingTask.id
            const reply = yield* textRequest({
              locations: s.scenario.locations,
              method: 'GET',
              path: taskPathOf(taskId),
            })
            const view = yield* decodeReply(PackEval.ReviewTaskView)(reply)
            const marker = yield* markerTextOf({ locations: s.scenario.locations, relative: markerRelative })
            return { reply, view, marker }
          })),
        Then('the selector output shows, and the marker at the unencoded path stays planted')((s) => {
          expect(s.view.view.packs[0]?.traceLoadedStems).toEqual(escapingTrace.loadedStems)
          expect(s.view.marker).toBe(markerPlanted)
        }),
      ),
    )
  })
