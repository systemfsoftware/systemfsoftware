import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect, Result } from 'effect'
import { expect } from 'vitest'
import {
  decodeReply,
  labelsFileText,
  readCandidates,
  readLabels,
  readPack,
  readTaskSet,
  ReviewFixture,
  reviewPackId,
  reviewServerFixture,
  type TextReply,
  textRequest,
  ventingRule,
  wateringRule,
  wateringStem,
  writeCandidates,
  writeLabels,
  writePackRules,
  writeTaskSet,
  writeTrace,
} from './__fixtures__/review-server.fixture.js'

const Feature = makeFeature({ it, layer })

const pruningOffer = new PackEval.CandidateTask({
  id: 'task-prune',
  text: 'Prune the tomato shoots before the weekend',
  dimensions: { job: 'pruning', pace: 'steady' },
})

const typingOffer = new PackEval.CandidateTask({
  id: 'task-typo',
  text: 'Correct the misspelled bed label',
  dimensions: { job: 'labelling', pace: 'steady' },
})

const offeredTasks = new PackEval.CandidateTasks({
  version: 1,
  candidates: [pruningOffer, typingOffer],
})

const pruningTask = new PackEval.Task({
  id: pruningOffer.id,
  text: pruningOffer.text,
  split: 'dev',
  dimensions: pruningOffer.dimensions,
})

const oneTaskSet = new PackEval.TaskSet({ version: 1, tasks: [pruningTask] })

const keptLabels = new PackEval.RoutingLabels({
  version: 1,
  entries: [
    new PackEval.RoutingLabelEntry({
      taskId: pruningTask.id,
      packId: reviewPackId,
      governing: [wateringStem],
      deferred: [],
    }),
  ],
})

const decodeAccepted = (reply: TextReply) => decodeReply(PackEval.ReviewAccepted)(reply)

const decodeRejected = (reply: TextReply) => decodeReply(PackEval.ReviewRejected)(reply)

const decodeSaved = (reply: TextReply) => decodeReply(PackEval.ReviewLabelsSaved)(reply)

const decodeView = (reply: TextReply) => decodeReply(PackEval.ReviewTaskView)(reply)

const labelPathOf = (taskId: string, packId: string): string => `/api/tasks/${taskId}/labels?pack=${packId}`

Feature('Reviewing offered tasks and labelling which rules govern the work')
  .withScenarioLayer(reviewServerFixture)
  .body(({ scenario }) => {
    scenario(
      'An accepted offer joins the task set, and a rejected one never does',
      Gherkin.Do.pipe(
        Given('a greenhouse pack of two rules and two offered tasks')(
          'world',
          () =>
            Effect.gen(function*() {
              const world = yield* ReviewFixture
              yield* writePackRules({ world, rules: [wateringRule, ventingRule] })
              yield* writeCandidates({ world, candidates: offeredTasks })
              return world
            }),
        ),
        When('the owner accepts one offer and rejects the other')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const acceptedReply = yield* textRequest({
                world: s.world,
                method: 'POST',
                path: `/api/candidates/${pruningOffer.id}/accept`,
              })
              const rejectedReply = yield* textRequest({
                world: s.world,
                method: 'POST',
                path: `/api/candidates/${typingOffer.id}/reject`,
              })
              const accepted = yield* decodeAccepted(acceptedReply)
              const rejected = yield* decodeRejected(rejectedReply)
              const tasks = yield* readTaskSet(s.world)
              const remaining = yield* readCandidates(s.world)
              return { acceptedReply, rejectedReply, accepted, rejected, tasks, remaining }
            }),
        ),
        Then('the accepted task sits in the task set, in the split the page was told')((s) => {
          expect(s.outcome.acceptedReply.body).toContain(pruningOffer.id)
          expect(s.outcome.accepted).toMatchObject({
            taskId: pruningOffer.id,
            split: s.outcome.acceptedReply.status === 200 ? 'dev' : 'test',
          })
          expect(s.outcome.tasks.tasks).toHaveLength(1)
          expect(s.outcome.tasks.tasks[0]).toMatchObject({
            id: pruningOffer.id,
            text: pruningOffer.text,
            split: s.outcome.accepted.split,
            dimensions: pruningOffer.dimensions,
          })
        }),
        Then('the rejected offer is gone, and never enters the task set')((s) => {
          expect(s.outcome.rejectedReply.body).toContain(typingOffer.id)
          expect(s.outcome.rejectedReply.status === 200 ? s.outcome.rejected : null).toMatchObject({
            taskId: typingOffer.id,
          })
          expect(s.outcome.remaining.candidates).toEqual([])
          expect(s.outcome.tasks.tasks.map((task) => task.id)).not.toContain(typingOffer.id)
        }),
      ),
    )

    scenario(
      'Routing labels are kept, served back, and leave the dataset admittable',
      Gherkin.Do.pipe(
        Given('a task set with one task, a pack of two rules, and no labels yet')(
          'world',
          () =>
            Effect.gen(function*() {
              const world = yield* ReviewFixture
              yield* writePackRules({ world, rules: [wateringRule, ventingRule] })
              yield* writeTaskSet({ world, tasks: oneTaskSet })
              return world
            }),
        ),
        When('the owner marks the watering rule as governing the pruning task')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const savedReply = yield* textRequest({
                world: s.world,
                method: 'PUT',
                path: labelPathOf(pruningTask.id, reviewPackId),
                body: { governing: [wateringStem], deferred: [] },
              })
              const seenReply = yield* textRequest({
                world: s.world,
                method: 'GET',
                path: `/api/tasks/${pruningTask.id}`,
              })
              const saved = yield* decodeSaved(savedReply)
              const view = yield* decodeView(seenReply)
              const labels = yield* readLabels(s.world)
              const pack = yield* readPack(s.world)
              const tasks = yield* readTaskSet(s.world)
              const admitted = PackEval.admitDataset(
                new PackEval.AdmitDataset({ packs: [pack], taskSet: tasks, routingLabels: labels }),
              )
              return { savedReply, seenReply, saved, view, labels, admitted }
            }),
        ),
        Then('the mark is kept in the label file')((s) => {
          expect(s.outcome.savedReply.body).toContain(pruningTask.id)
          expect(s.outcome.savedReply.status === 200 ? s.outcome.saved : null).toMatchObject({
            taskId: pruningTask.id,
            packId: reviewPackId,
          })
          expect(s.outcome.labels.entries).toHaveLength(1)
          expect(s.outcome.labels.entries[0]).toMatchObject({
            taskId: pruningTask.id,
            packId: reviewPackId,
            governing: [wateringStem],
            deferred: [],
          })
        }),
        Then('the next read serves the same mark back')((s) => {
          expect(s.outcome.seenReply.body).toContain(pruningTask.id)
          expect(s.outcome.seenReply.status === 200 ? s.outcome.view : null).toMatchObject({
            taskId: pruningTask.id,
          })
          expect(s.outcome.view.packs[0]?.governing).toEqual([wateringStem])
          expect(s.outcome.view.packs[0]?.deferred).toEqual([])
        }),
        Then('the written dataset is admitted unchanged')((s) => {
          expect(Result.isSuccess(s.outcome.admitted)).toBe(true)
        }),
      ),
    )

    scenario(
      'The selector stays hidden until a task is labelled',
      Gherkin.Do.pipe(
        Given('a traced task whose routing is still unlabelled')(
          'world',
          () =>
            Effect.gen(function*() {
              const world = yield* ReviewFixture
              yield* writePackRules({ world, rules: [wateringRule, ventingRule] })
              yield* writeTaskSet({ world, tasks: oneTaskSet })
              yield* writeTrace({ world, taskId: pruningTask.id, loadedStems: [wateringStem] })
              return world
            }),
        ),
        When('the page is asked for the task before any label is entered')(
          'blind',
          (s) =>
            Effect.gen(function*() {
              const reply = yield* textRequest({
                world: s.world,
                method: 'GET',
                path: `/api/tasks/${pruningTask.id}`,
              })
              const view = yield* decodeView(reply)
              return { reply, view }
            }),
        ),
        When('the owner marks a rule governing and the page is asked again')(
          'labelled',
          (s) =>
            Effect.gen(function*() {
              const savedReply = yield* textRequest({
                world: s.world,
                method: 'PUT',
                path: labelPathOf(pruningTask.id, reviewPackId),
                body: { governing: [wateringStem], deferred: [] },
              })
              const reply = yield* textRequest({
                world: s.world,
                method: 'GET',
                path: `/api/tasks/${pruningTask.id}`,
              })
              const saved = yield* decodeSaved(savedReply)
              const view = yield* decodeView(reply)
              return { savedReply, reply, saved, view }
            }),
        ),
        Then('the unlabelled answer carries no selector output')((s) => {
          expect(s.blind.view.text).toBe(pruningTask.text)
          expect(s.blind.view.packs[0]?.governing).toEqual([])
          expect(s.blind.view.packs[0]?.traceLoadedStems).toBeUndefined()
          expect(s.blind.reply.body).not.toContain('traceLoadedStems')
          expect(s.blind.reply.body).toContain(s.blind.reply.status === 200 ? pruningTask.id : 'missing')
        }),
        Then('the labelled answer carries the rules the selector loaded')((s) => {
          expect(s.labelled.savedReply.body).toContain(pruningTask.id)
          expect(s.labelled.savedReply.status === 200 ? s.labelled.saved : null).toMatchObject({
            taskId: pruningTask.id,
            packId: reviewPackId,
          })
          expect(s.labelled.view.packs[0]?.governing).toEqual([wateringStem])
          expect(s.labelled.reply.body).toContain(wateringStem)
          expect(s.labelled.reply.status === 200 ? s.labelled.view.packs[0]?.traceLoadedStems : []).toEqual([
            wateringStem,
          ])
        }),
      ),
    )

    scenario(
      'A label naming a rule the pack does not hold is refused',
      Gherkin.Do.pipe(
        Given('a pruning task whose routing was already labelled')(
          'world',
          () =>
            Effect.gen(function*() {
              const world = yield* ReviewFixture
              yield* writePackRules({ world, rules: [wateringRule, ventingRule] })
              yield* writeTaskSet({ world, tasks: oneTaskSet })
              yield* writeLabels({ world, labels: keptLabels })
              return world
            }),
        ),
        When('the owner submits a mark naming a rule the pack does not hold')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const before = yield* labelsFileText(s.world)
              const refusedReply = yield* textRequest({
                world: s.world,
                method: 'PUT',
                path: labelPathOf(pruningTask.id, reviewPackId),
                body: { governing: ['compost-tea'], deferred: [] },
              })
              const after = yield* labelsFileText(s.world)
              return { before, after, refusedReply }
            }),
        ),
        Then('the mark is refused, and the rule is named')((s) => {
          expect(s.outcome.refusedReply.body).toContain('compost-tea')
          expect(s.outcome.refusedReply.body).toContain('unknown stem')
        }),
        Then('the label file is left exactly as it was')((s) => {
          expect(s.outcome.after).toBe(s.outcome.before)
        }),
      ),
    )
  })
