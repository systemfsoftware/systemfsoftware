import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect } from 'effect'
import { expect } from 'vitest'
import {
  candidatesOf,
  dimensionNamesOf,
  fileTextOf,
  generatedTasksOf,
  generationScenarioOf,
  generatorStack,
  packIdOf,
  refusedPathOf,
  selectorStack,
  selectorStemsOf,
  traceNamesOf,
  traceOf,
  tracingScenarioOf,
} from './__fixtures__/discovery-dataset.fixture.js'
import { openRouterLoopback } from './__fixtures__/openrouter-loopback.fixture.js'
import { discoveryWorld } from './__fixtures__/pack-eval-world.fixture.js'

const Feature = makeFeature({ it, layer })

const greenhouseWorld = discoveryWorld()

const refusalWorld = discoveryWorld({
  dimensions: { kind: 'raw', text: '{"application": "a greenhouse diary"}' },
})

Feature('Growing a task set from owner dimensions and tracing the selector over it')
  .withScenarioLayer(openRouterLoopback)
  .body(({ scenario }) => {
    scenario(
      'Two offered tuples become two candidate tasks, each written in its own question',
      Gherkin.Do.pipe(
        Given('a greenhouse diary whose owner has written the job and pace dimensions')(
          'scenario',
          () => generationScenarioOf(greenhouseWorld),
        ),
        When('the owner asks for candidates, and asks again once the first answer is kept')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const stack = generatorStack({
                cacheDir: s.scenario.materialized.cacheDir,
                provider: s.scenario.materialized.provider,
              })
              const before = yield* fileTextOf({
                path: `${s.scenario.materialized.datasetDir}/tasks.json`,
              })
              const first = yield* PackEval.generateTasks.run({
                datasetDir: s.scenario.materialized.datasetDir,
                workDir: s.scenario.materialized.workDir,
              }).pipe(Effect.provide(stack))
              const second = yield* PackEval.generateTasks.run({
                datasetDir: s.scenario.materialized.datasetDir,
                workDir: s.scenario.materialized.workDir,
              }).pipe(Effect.provide(stack))
              const asked = yield* s.scenario.materialized.provider.requests
              const candidates = yield* candidatesOf({ workDir: s.scenario.materialized.workDir })
              const after = yield* fileTextOf({ path: `${s.scenario.materialized.datasetDir}/tasks.json` })
              return { first, second, asked, candidates, before, after }
            }),
        ),
        Then('the tuples were asked for once, and each task was written in its own question')((s) => {
          const written = generatedTasksOf(s.scenario.world)
          const texts = s.outcome.asked.map((request) => request.text)
          expect(texts).toHaveLength(written.length + 1)
          expect(texts[0]).toContain(`combinations of ${dimensionNamesOf(s.scenario.world)}`)
          written.forEach((task, index) => {
            const prompt = texts[index + 1] ?? ''
            for (const value of Object.values(task.tuple)) {
              expect(prompt).toContain(value)
            }
            expect(prompt).toContain('Now generate a new task.')
          })
        }),
        Then('the candidate folder holds both tasks, each tagged with the tuple it came from')((s) => {
          const written = generatedTasksOf(s.scenario.world)
          expect(s.outcome.candidates.candidates.map((candidate) => candidate.text)).toEqual(
            written.map((task) => task.text),
          )
          expect(s.outcome.candidates.candidates.map((candidate) => candidate.dimensions)).toEqual(
            written.map((task) => task.tuple),
          )
          expect(s.outcome.first.admittedIds).toHaveLength(written.length)
          expect(s.outcome.candidates.candidates.map((candidate) => candidate.id)).toEqual(
            s.outcome.first.admittedIds,
          )
          expect(s.outcome.first.candidateCount).toBe(written.length)
        }),
        Then('the second ask brought nothing new, asked nothing, and left the task set alone')((s) => {
          expect(s.outcome.second.admittedIds).toEqual([])
          expect(s.outcome.second.candidateCount).toBe(generatedTasksOf(s.scenario.world).length)
          expect(s.outcome.after).toBe(s.outcome.before)
        }),
      ),
    )

    scenario(
      'A five-task set leaves one trace per task, each saying which rules were loaded and who answered',
      Gherkin.Do.pipe(
        Given('a five-task greenhouse set, one pack, and one scripted answer per task')(
          'scenario',
          () => tracingScenarioOf(greenhouseWorld),
        ),
        When('the selector is traced over the whole task set')('outcome', (s) =>
          Effect.gen(function*() {
            const packId = packIdOf(s.scenario.world)
            const traced = yield* PackEval.traceSelection.run({
              datasetDir: s.scenario.materialized.datasetDir,
              workDir: s.scenario.materialized.workDir,
              packDirs: s.scenario.materialized.packDirs,
            }).pipe(
              Effect.provide(
                selectorStack({
                  cacheDir: s.scenario.materialized.cacheDir,
                  provider: s.scenario.materialized.provider,
                }),
              ),
            )
            const keys = yield* s.scenario.materialized.provider.requestKeys
            const names = yield* traceNamesOf({ workDir: s.scenario.materialized.workDir, packId })
            const traces = yield* Effect.forEach(s.scenario.world.tasks, (task) =>
              traceOf({ workDir: s.scenario.materialized.workDir, packId, taskId: task.id }))
            return { traced, keys, names, traces }
          })),
        Then('one trace is written per task under the pack it was asked about')((s) => {
          const names = s.scenario.world.tasks.map((task) => `${task.id}.json`).toSorted()
          expect(s.outcome.traced.tracePaths).toHaveLength(s.scenario.world.tasks.length)
          expect(s.outcome.names.toSorted()).toEqual(names)
        }),
        Then('each trace names the task, the pack, the rules it loaded, and the model that answered')((s) => {
          const packId = packIdOf(s.scenario.world)
          expect(s.outcome.traces.map((trace) => trace.taskId)).toEqual(
            s.scenario.world.tasks.map((task) => task.id),
          )
          expect(s.outcome.traces.map((trace) => trace.packId)).toEqual(
            s.outcome.traces.map(() => packId),
          )
          expect(s.outcome.traces.map((trace) => trace.loadedStems)).toEqual(
            s.scenario.world.tasks.map((task) => selectorStemsOf({ world: s.scenario.world, taskId: task.id })),
          )
          expect(s.outcome.traces.map((trace) => trace.requestedModel)).toEqual(
            s.outcome.traces.map(() => s.scenario.materialized.request.selectorModel),
          )
        }),
        Then('each question reached the provider once, matched to the task it asked about')((s) => {
          expect(s.outcome.keys).toHaveLength(s.scenario.world.tasks.length)
          expect(s.outcome.keys.every((key) => key.outcome === 'matched')).toBe(true)
        }),
      ),
    )

    scenario(
      'A dimensions file that describes no dimensions stops the run before the provider is asked',
      Gherkin.Do.pipe(
        Given('a greenhouse diary whose dimensions file holds no dimension at all')(
          'scenario',
          () => generationScenarioOf(refusalWorld),
        ),
        When('the owner asks for candidates')('outcome', (s) =>
          Effect.gen(function*() {
            const refusal = yield* Effect.flip(
              PackEval.generateTasks.run({
                datasetDir: s.scenario.materialized.datasetDir,
                workDir: s.scenario.materialized.workDir,
              }).pipe(
                Effect.provide(
                  generatorStack({
                    cacheDir: s.scenario.materialized.cacheDir,
                    provider: s.scenario.materialized.provider,
                  }),
                ),
              ),
            )
            const asked = yield* s.scenario.materialized.provider.requestCount
            return { refusal, asked }
          })),
        Then('the ask is refused, and names the dimensions file')((s) => {
          expect(s.outcome.refusal._tag).toBe('DatasetFileRefusal')
          expect(refusedPathOf(s.outcome.refusal).endsWith('dimensions.json')).toBe(true)
        }),
        Then('no question reached the provider')((s) => {
          expect(s.outcome.asked).toBe(0)
        }),
      ),
    )
  })
