import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect, Result } from 'effect'
import { expect } from 'vitest'
import { reviewWorld, type World } from './__fixtures__/pack-eval-world.fixture.js'
import {
  decodeReply,
  labelsPathOf,
  requiredElementOf,
  ReviewFixture,
  reviewPackId,
  reviewServerFixture,
  routingLabelsOf,
  taskPathOf,
  taskSetOf,
  textRequest,
  writeWorld,
} from './__fixtures__/review-server.fixture.js'

const Feature = makeFeature({ it, layer })

/** The review world's offers, candidates waiting for the owner's verdict. */
export const offerOf = (options: { readonly world: World; readonly index: number }): World['candidates'][number] =>
  requiredElementOf({ values: options.world.candidates, index: options.index, what: 'an offered candidate' })

const beforeLabels = reviewWorld({ routingLabels: [] })

const refusedStem = 'compost-tea'

Feature('Reviewing offered tasks and labelling which rules govern the work')
  .withScenarioLayer(reviewServerFixture)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'An accepted offer joins the task set with the text, the split, and the dimensions the offer carried',
      Gherkin.Do.pipe(
        Given('a greenhouse with two offers and no task set yet')('scenario', () =>
          Effect.gen(function*() {
            const locations = yield* ReviewFixture
            yield* writeWorld({ locations, world: beforeLabels })
            return { locations, world: beforeLabels }
          })),
        When('the owner accepts the first offer')('outcome', (s) =>
          Effect.gen(function*() {
            const offer = offerOf({ world: s.scenario.world, index: 0 })
            const reply = yield* textRequest({
              locations: s.scenario.locations,
              method: 'POST',
              path: `/api/candidates/${offer.id}/accept`,
            })
            const accepted = yield* decodeReply(PackEval.ReviewAccepted)(reply)
            const stored = yield* taskSetOf(s.scenario.locations)
            const listed = yield* decodeReply(PackEval.ReviewTaskList)(
              yield* textRequest({ locations: s.scenario.locations, method: 'GET', path: '/api/tasks' }),
            )
            return { reply, accepted, stored, listed }
          })),
        Then('the accepted reply and the stored task agree on the text and the split')((s) => {
          const tasks = s.outcome.stored.tasks.filter((entry) => entry.id === s.outcome.accepted.taskId)
          expect(s.outcome.reply.body).toContain(s.outcome.accepted.taskId)
          expect(tasks.map((entry) => entry.text)).toEqual([offerOf({ world: s.scenario.world, index: 0 }).text])
          expect(tasks.map((entry) => entry.split)).toEqual([s.outcome.accepted.split])
          expect(tasks.map((entry) => entry.dimensions)).toEqual([
            offerOf({ world: s.scenario.world, index: 0 }).dimensions,
          ])
          expect(s.outcome.listed.tasks.map((entry) => entry.taskId)).toContain(s.outcome.accepted.taskId)
        }),
      ),
    )

    scenarioOutline(
      'An offer the owner <decision> <effect> the task set',
      [
        { decision: 'accepts', action: 'accept', index: 0, effect: 'adds to', heldTasks: 1, standingOffers: 1 },
        { decision: 'rejects', action: 'reject', index: 1, effect: 'keeps out of', heldTasks: 0, standingOffers: 1 },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('a greenhouse with two offers and no task set yet')('scenario', () =>
            Effect.gen(function*() {
              const locations = yield* ReviewFixture
              yield* writeWorld({ locations, world: beforeLabels })
              return { locations, world: beforeLabels }
            })),
          When('the owner gives one offer its verdict')('outcome', (s) =>
            Effect.gen(function*() {
              const offer = offerOf({ world: s.scenario.world, index: row.index })
              const reply = yield* textRequest({
                locations: s.scenario.locations,
                method: 'POST',
                path: `/api/candidates/${offer.id}/${row.action}`,
              })
              const listed = yield* decodeReply(PackEval.ReviewTaskList)(
                yield* textRequest({ locations: s.scenario.locations, method: 'GET', path: '/api/tasks' }),
              )
              const remaining = yield* decodeReply(PackEval.ReviewCandidateList)(
                yield* textRequest({ locations: s.scenario.locations, method: 'GET', path: '/api/candidates' }),
              )
              return { reply, offer, listed, remaining }
            })),
          Then('the reply names the offer, and the task set holds it only now')((s) => {
            const held = s.outcome.listed.tasks.filter((entry) => entry.taskId === s.outcome.offer.id)
            expect(s.outcome.reply.body).toContain(s.outcome.offer.id)
            expect(held).toHaveLength(row.heldTasks)
            expect(held.map((entry) => entry.text)).toEqual(held.map(() => s.outcome.offer.text))
          }),
          Then('an offer left standing stays open when the other offer was judged instead')((s) => {
            const other = offerOf({ world: s.scenario.world, index: row.index === 1 ? 0 : 1 })
            const standing = s.outcome.remaining.candidates.filter((entry) => entry.id === other.id)
            expect(standing).toHaveLength(row.standingOffers)
          }),
        ),
    )

    scenario(
      'Routing labels are kept, served back, and leave the dataset admittable',
      Gherkin.Do.pipe(
        Given('a greenhouse task and two rules, with no labels yet')('scenario', () =>
          Effect.gen(function*() {
            const locations = yield* ReviewFixture
            yield* writeWorld({ locations, world: beforeLabels })
            return { locations, world: beforeLabels }
          })),
        When('the owner marks the watering rule as governing the pruning task')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const task = requiredElementOf({ values: s.scenario.world.tasks, index: 2, what: 'a routing task' })
              const stem = requiredElementOf({
                values: s.scenario.world.packs.flatMap((pack) => pack.rules.map((rule) => rule.stem)),
                index: 0,
                what: 'a governing stem',
              })
              const savedReply = yield* textRequest({
                locations: s.scenario.locations,
                method: 'PUT',
                path: labelsPathOf({ taskId: task.id, packId: reviewPackId }),
                body: { governing: [stem], deferred: [] },
              })
              const seenReply = yield* textRequest({
                locations: s.scenario.locations,
                method: 'GET',
                path: taskPathOf(task.id),
              })
              const saved = yield* decodeReply(PackEval.ReviewLabelsSaved)(savedReply)
              const view = yield* decodeReply(PackEval.ReviewTaskView)(seenReply)
              const pack = yield* PackEval.DatasetFiles.readPack(
                `${s.scenario.locations.packsRoot}/${reviewPackId}`,
              )
              const taskSet = yield* taskSetOf(s.scenario.locations)
              const labels = yield* routingLabelsOf(s.scenario.locations)
              const admitted = PackEval.admitDataset(
                new PackEval.AdmitDataset({ packs: [pack], taskSet, routingLabels: labels }),
              )
              return { task, stem, savedReply, seenReply, saved, view, labels, admitted }
            }),
        ),
        Then('the mark is kept in the label file')((s) => {
          expect(s.outcome.savedReply.body).toContain(s.outcome.task.id)
          expect(s.outcome.saved).toMatchObject({ taskId: s.outcome.task.id, packId: reviewPackId })
          expect(s.outcome.labels.entries).toHaveLength(1)
          expect(s.outcome.labels.entries[0]).toMatchObject({
            taskId: s.outcome.task.id,
            packId: reviewPackId,
            governing: [s.outcome.stem],
            deferred: [],
          })
        }),
        Then('the next read serves the same mark back')((s) => {
          expect(s.outcome.seenReply.body).toContain(s.outcome.task.id)
          expect(s.outcome.view.packs[0]).toMatchObject({
            packId: reviewPackId,
            governing: [s.outcome.stem],
            deferred: [],
          })
        }),
        Then('the written dataset is admitted unchanged')((s) => {
          expect(Result.isSuccess(s.outcome.admitted)).toBe(true)
        }),
      ),
    )

    scenario(
      'The selector stays hidden until a task is labelled',
      Gherkin.Do.pipe(
        Given('a traced task whose routing is still unlabelled')('scenario', () =>
          Effect.gen(function*() {
            const locations = yield* ReviewFixture
            yield* writeWorld({ locations, world: beforeLabels })
            return { locations, world: beforeLabels }
          })),
        When('the page is asked for the task before any label is entered')('blind', (s) =>
          Effect.gen(function*() {
            const task = requiredElementOf({ values: s.scenario.world.tasks, index: 0, what: 'a traced task' })
            const reply = yield* textRequest({
              locations: s.scenario.locations,
              method: 'GET',
              path: taskPathOf(task.id),
            })
            const view = yield* decodeReply(PackEval.ReviewTaskView)(reply)
            return { task, reply, view }
          })),
        When('the owner marks a rule governing and the page is asked again')('labelled', (s) =>
          Effect.gen(function*() {
            const stem = requiredElementOf({
              values: s.scenario.world.traces.flatMap((trace) => trace.loadedStems),
              index: 0,
              what: 'a selected stem',
            })
            const savedReply = yield* textRequest({
              locations: s.scenario.locations,
              method: 'PUT',
              path: labelsPathOf({ taskId: s.blind.task.id, packId: reviewPackId }),
              body: { governing: [stem], deferred: [] },
            })
            const reply = yield* textRequest({
              locations: s.scenario.locations,
              method: 'GET',
              path: taskPathOf(s.blind.task.id),
            })
            const saved = yield* decodeReply(PackEval.ReviewLabelsSaved)(savedReply)
            const view = yield* decodeReply(PackEval.ReviewTaskView)(reply)
            return { reply, view, saved }
          })),
        Then('the unlabelled answer carries no selector output')((s) => {
          expect(s.blind.view.packs[0]?.governing).toEqual([])
          expect(s.blind.view.packs[0]?.traceLoadedStems).toBeUndefined()
          expect(s.blind.reply.body).not.toContain('traceLoadedStems')
          expect(s.blind.reply.body).toContain(s.blind.task.id)
        }),
        Then('the labelled answer carries the rules the selector loaded')((s) => {
          expect(s.labelled.view.packs[0]?.traceLoadedStems).toEqual(
            s.scenario.world.traces[0]?.loadedStems ?? [],
          )
          expect(s.labelled.view.packs[0]?.governing).toHaveLength(1)
          expect(s.labelled.reply.body).toContain(s.labelled.view.packs[0]?.governing[0] ?? '')
        }),
      ),
    )

    scenario(
      'A label naming a rule the pack does not hold is refused',
      Gherkin.Do.pipe(
        Given('a greenhouse task with no labels yet')('scenario', () =>
          Effect.gen(function*() {
            const locations = yield* ReviewFixture
            yield* writeWorld({ locations, world: beforeLabels })
            return { locations, world: beforeLabels }
          })),
        When('the owner submits a mark naming a rule the pack does not hold')('outcome', (s) =>
          Effect.gen(function*() {
            const task = requiredElementOf({ values: s.scenario.world.tasks, index: 0, what: 'a routing task' })
            const before = yield* routingLabelsOf(s.scenario.locations)
            const refusedReply = yield* textRequest({
              locations: s.scenario.locations,
              method: 'PUT',
              path: labelsPathOf({ taskId: task.id, packId: reviewPackId }),
              body: { governing: [refusedStem], deferred: [] },
            })
            const after = yield* routingLabelsOf(s.scenario.locations)
            return { before, after, refusedReply }
          })),
        Then('the mark is refused, and the rule is named')((s) => {
          expect(s.outcome.refusedReply.body).toContain(refusedStem)
          expect(s.outcome.refusedReply.body).toContain('unknown stem')
        }),
        Then('the label file is left exactly as it was')((s) => {
          expect(s.outcome.after).toEqual(s.outcome.before)
        }),
      ),
    )
  })
