import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect, Schema } from 'effect'
import { expect } from 'vitest'
import {
  askedModel,
  candidatesAt,
  candidatesFileExists,
  discoveryPackId,
  type DiscoveryWorld,
  discoveryWorld,
  generatorStack,
  pathExists,
  type RuleSource,
  selectorStack,
  servedModel,
  stemsReply,
  taskReply,
  taskSetExists,
  traceAt,
  traceNamesAt,
  tuplesReply,
} from './__fixtures__/discovery-dataset.fixture.js'
import { openRouterLoopback } from './__fixtures__/openrouter-loopback.fixture.js'

const Feature = makeFeature({ it, layer })

const dimensionJob = new PackEval.Dimension({
  name: 'job',
  captures: 'the work being done',
  values: ['watering', 'pruning', 'feeding'],
})
const dimensionPace = new PackEval.Dimension({
  name: 'pace',
  captures: 'how the day is going',
  values: ['steady', 'rushed'],
})

const seeds: ReadonlyArray<PackEval.DimensionTuple> = [{ job: 'watering', pace: 'steady' }]
const tuplePruning: PackEval.DimensionTuple = { job: 'pruning', pace: 'rushed' }
const tupleFeeding: PackEval.DimensionTuple = { job: 'feeding', pace: 'steady' }

const ownerDimensions = new PackEval.TaskDimensions({
  version: 1,
  application: 'a greenhouse diary',
  dimensions: [dimensionJob, dimensionPace],
  seeds,
})

const instruction = new PackEval.SelectorInstruction({
  text: 'Load every rule whose applies_when matches the work the task describes.',
  provenance: new PackEval.SelectorProvenance({
    consumer: 'greenkeeper',
    pluginVersion: '1.0.0',
    sourcePath: 'references/agents/greenkeeper.md',
  }),
})

const greenhouseRules: ReadonlyArray<RuleSource> = [
  {
    stem: 'watering-schedule',
    title: 'Water on a schedule',
    appliesWhen: ['touching the watering plan'],
    tags: ['water'],
    body: 'Water every second morning and write the amount in the log.',
  },
  {
    stem: 'night-venting',
    title: 'Keep the air moving at night',
    appliesWhen: ['closing the vents for the night'],
    tags: ['air'],
    body: 'Leave one vent open a hand width after the last walk-through.',
  },
]

const taskHoeing = new PackEval.Task({
  id: 'task-hoeing',
  text: 'Hoe the beds before the weekend',
  split: 'dev',
  dimensions: { job: 'feeding', pace: 'steady' },
})

const taskVenting = new PackEval.Task({
  id: 'task-venting',
  text: 'Close the vents after the last walk-through',
  split: 'test',
  dimensions: { job: 'watering', pace: 'rushed' },
})

const taskSet = new PackEval.TaskSet({ version: 1, tasks: [taskHoeing, taskVenting] })

const escapingTaskId = '../../escaped/beds'

const taskEscaping = new PackEval.Task({
  id: escapingTaskId,
  text: 'Hoe the beds by the far wall',
  split: 'dev',
  dimensions: { job: 'feeding', pace: 'rushed' },
})

const growCandidates = (world: DiscoveryWorld) =>
  PackEval.generateTasks.run({ datasetDir: world.datasetDir, workDir: world.workDir }).pipe(
    Effect.provide(generatorStack(world)),
  )

const traceTasks = (world: DiscoveryWorld) =>
  PackEval.traceSelection.run({
    datasetDir: world.datasetDir,
    workDir: world.workDir,
    packDirs: [world.packDir],
  }).pipe(Effect.provide(selectorStack(world)))

const selectDirectly = (world: DiscoveryWorld, task: PackEval.Task) =>
  Effect.gen(function*() {
    const pack = yield* PackEval.DatasetFiles.readPack(world.packDir)
    const selector = yield* PackEval.RuleSelector
    return yield* selector.select({ pack, task, instruction })
  }).pipe(Effect.provide(selectorStack(world)))

Feature('Growing a task set from owner dimensions and tracing the selector over it')
  .withScenarioLayer(openRouterLoopback)
  .body(({ scenario }) => {
    scenario(
      'Two offered tuples become two candidate tasks, each written in its own question',
      Gherkin.Do.pipe(
        Given('a greenhouse diary whose owner has written the job and pace dimensions')(
          'world',
          () =>
            discoveryWorld({
              replies: [
                tuplesReply([tuplePruning, tupleFeeding]),
                taskReply('Prune the tomato shoots before the weekend'),
                taskReply('Feed the beds on Friday morning'),
              ],
              dimensions: ownerDimensions,
            }),
        ),
        When('the owner asks for candidates, and asks again once the first answer is kept')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const first = yield* growCandidates(s.world)
              const second = yield* growCandidates(s.world)
              const asked = yield* s.world.provider.requests
              const candidates = yield* candidatesAt(s.world.workDir)
              const candidatesFile = yield* candidatesFileExists(s.world.workDir)
              const taskSetFile = yield* taskSetExists(s.world.datasetDir)
              return { first, second, asked, candidates, candidatesFile, taskSetFile }
            }),
        ),
        Then('the tuples were asked for once, and each task was written in its own question')((s) => {
          expect(s.outcome.asked).toHaveLength(3)
          expect(s.outcome.asked[0]?.text).toContain('combinations of (job, pace)')
          expect(s.outcome.asked[1]?.text).toContain('job: pruning')
          expect(s.outcome.asked[1]?.text).toContain('pace: rushed')
          expect(s.outcome.asked[1]?.text).toContain('Now generate a new task.')
          expect(s.outcome.asked[2]?.text).toContain('job: feeding')
          expect(s.outcome.asked[2]?.text).toContain('pace: steady')
        }),
        Then('the candidate folder holds both tasks, each tagged with the tuple it came from')((s) => {
          expect(s.outcome.candidates.candidates.map((candidate) => candidate.text)).toEqual([
            'Prune the tomato shoots before the weekend',
            'Feed the beds on Friday morning',
          ])
          expect(s.outcome.candidates.candidates.map((candidate) => candidate.dimensions)).toEqual([
            tuplePruning,
            tupleFeeding,
          ])
          expect(s.outcome.candidates.candidates.map((candidate) => candidate.id)).toEqual(s.outcome.first.admittedIds)
          expect(s.outcome.first.admittedIds).toHaveLength(2)
          expect(s.outcome.first.candidateCount).toBe(2)
        }),
        Then('the second ask brought nothing new, asked nothing, and left the task set alone')((s) => {
          expect(s.outcome.second.admittedIds).toEqual([])
          expect(s.outcome.second.candidateCount).toBe(2)
          expect(s.outcome.candidatesFile).toBe(true)
          expect(s.outcome.taskSetFile).toBe(false)
        }),
      ),
    )

    scenario(
      'A two-task set leaves one trace per task, each saying which rules were loaded and who answered',
      Gherkin.Do.pipe(
        Given('a task set of two jobs, a greenhouse pack of two rules, and the owner instruction')(
          'world',
          () =>
            discoveryWorld({
              replies: [stemsReply(['watering-schedule']), stemsReply([])],
              dimensions: ownerDimensions,
              tasks: taskSet,
              instruction,
              rules: greenhouseRules,
            }),
        ),
        When('the selector is traced over the whole task set')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const fingerprint = yield* selectDirectly(s.world, taskHoeing)
              const traced = yield* traceTasks(s.world)
              const asked = yield* s.world.provider.requestCount
              const names = yield* traceNamesAt({ workDir: s.world.workDir, packId: discoveryPackId })
              const hoeing = yield* traceAt({
                workDir: s.world.workDir,
                packId: discoveryPackId,
                taskId: taskHoeing.id,
              })
              const venting = yield* traceAt({
                workDir: s.world.workDir,
                packId: discoveryPackId,
                taskId: taskVenting.id,
              })
              return { fingerprint, traced, asked, names: names.toSorted(), hoeing, venting }
            }),
        ),
        Then('one trace is written per task under the pack it was asked about')((s) => {
          expect(s.outcome.names).toEqual([`${taskHoeing.id}.json`, `${taskVenting.id}.json`])
          expect(s.outcome.traced.tracePaths).toHaveLength(2)
        }),
        Then('each trace names the task, the pack, the rules it loaded, and the model that answered')((s) => {
          expect(s.outcome.hoeing.taskId).toBe(taskHoeing.id)
          expect(s.outcome.hoeing.packId).toBe(discoveryPackId)
          expect(s.outcome.hoeing.loadedStems).toEqual(['watering-schedule'])
          expect(s.outcome.venting.taskId).toBe(taskVenting.id)
          expect(s.outcome.venting.packId).toBe(discoveryPackId)
          expect(s.outcome.venting.loadedStems).toEqual([])
          expect(s.outcome.hoeing.servedModel).toBe(servedModel)
          expect(s.outcome.venting.servedModel).toBe(servedModel)
          expect(s.outcome.hoeing.requestedModel).toBe(askedModel)
        }),
        Then('both traces carry the fingerprint of the one instruction they were given')((s) => {
          expect(s.outcome.hoeing.instructionDigest).toBe(s.outcome.fingerprint.instructionDigest)
          expect(s.outcome.venting.instructionDigest).toBe(s.outcome.fingerprint.instructionDigest)
          expect(s.outcome.asked).toBe(2)
        }),
      ),
    )

    scenario(
      'A task named with a slash and two dots still keeps its trace inside the work folder',
      Gherkin.Do.pipe(
        Given('an accepted task was named after a folder two levels above the work folder')(
          'world',
          () =>
            discoveryWorld({
              replies: [stemsReply(['watering-schedule'])],
              dimensions: ownerDimensions,
              tasks: new PackEval.TaskSet({ version: 1, tasks: [taskEscaping] }),
              instruction,
              rules: greenhouseRules,
            }),
        ),
        When('the selector is traced over that task')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const traced = yield* traceTasks(s.world)
              const trace = yield* traceAt({
                workDir: s.world.workDir,
                packId: discoveryPackId,
                taskId: escapingTaskId,
              })
              const escaped = yield* pathExists(s.world.workDir, '..', 'escaped')
              return { traced, trace, escaped }
            }),
        ),
        Then("the trace sits in the pack's trace folder and reads back under the task's own name")((s) => {
          expect(s.outcome.traced.tracePaths).toHaveLength(1)
          expect(s.outcome.traced.tracePaths[0]?.startsWith(`${s.world.workDir}/traces/${discoveryPackId}/`)).toBe(true)
          expect(s.outcome.trace.taskId).toBe(escapingTaskId)
        }),
        Then('nothing was written beside the work folder')((s) => {
          expect(s.outcome.escaped).toBe(false)
        }),
      ),
    )

    scenario(
      'A dimensions file that describes no dimensions stops the run before the provider is asked',
      Gherkin.Do.pipe(
        Given('a greenhouse diary whose dimensions file holds no dimension at all')(
          'world',
          () =>
            discoveryWorld({
              replies: [],
              rawDimensions: '{"application": "a greenhouse diary"}',
            }),
        ),
        When('the owner asks for candidates')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const refusal = yield* Effect.flip(growCandidates(s.world))
              const asked = yield* s.world.provider.requestCount
              return { refusal, asked }
            }),
        ),
        Then('the ask is refused, and names the dimensions file')((s) => {
          expect(s.outcome.refusal).toMatchObject({ _tag: 'DatasetFileRefusal' })
          const refused = s.outcome.refusal
          const path = Schema.is(PackEval.DatasetFileRefusal)(refused) ? refused.path : ''
          expect(path.endsWith('dimensions.json')).toBe(true)
          expect(path.length).toBeGreaterThan('dimensions.json'.length)
        }),
        Then('no question reached the provider')((s) => {
          expect(s.outcome.asked).toBe(0)
        }),
      ),
    )
  })
