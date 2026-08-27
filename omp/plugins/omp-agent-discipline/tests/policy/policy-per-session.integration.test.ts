import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect, Layer } from 'effect'
import * as Path from 'effect/Path'
import { afterEach, expect } from 'vitest'
import { __resetNoDelegateSkillsForTesting, NoDelegateSkillsLive } from '../../src/delegation/config.js'
import { runNoSkillDelegation } from '../../src/delegation/delegation.js'
import { __resetDispatchDoctrineSkillsForTesting, DispatchDoctrineSkillsLive } from '../../src/doctrine/config.js'
import { warmHarnessPolicy } from '../../src/runtime.js'

afterEach(() => {
  __resetNoDelegateSkillsForTesting()
  __resetDispatchDoctrineSkillsForTesting()
})

const Feature = makeFeature({ it, layer })

Feature('Policy per-session timing — two cwds get their own projects config').body(({ scenario }) => {
  scenario(
    'Should isolate per-session policy between two project cwds',
    Gherkin.Do.pipe(
      Given('a memfs with two project tomls')('ctx', () =>
        Effect.succeed({
          contents: {
            '/project-a/systemfsoftware.toml': 'no_delegate_skills = ["ce-work"]',
            '/project-b/systemfsoftware.toml': 'no_delegate_skills = ["other-skill"]',
          } as const,
        })),
      When('both project cwds are warmed and delegation checks run')('result', (s) =>
        Effect.gen(function*() {
          const fsLayer = MemoryFileSystem.layerWith(s.ctx.contents)
          const policyLive = Layer.mergeAll(NoDelegateSkillsLive, DispatchDoctrineSkillsLive)
          const appLayer = Layer.mergeAll(fsLayer, Path.layer, policyLive)

          yield* warmHarnessPolicy('/project-a').pipe(Effect.provide(appLayer))
          yield* warmHarnessPolicy('/project-b').pipe(Effect.provide(appLayer))

          const a = yield* runNoSkillDelegation('/project-a', 'task', 'ce-work', 'invoke ce-work').pipe(
            Effect.provide(appLayer),
          )
          const b = yield* runNoSkillDelegation('/project-b', 'task', 'other-skill', 'invoke other-skill').pipe(
            Effect.provide(appLayer),
          )
          const crossA = yield* runNoSkillDelegation('/project-a', 'task', 'other-skill', 'invoke other-skill').pipe(
            Effect.provide(appLayer),
          )
          const crossB = yield* runNoSkillDelegation('/project-b', 'task', 'ce-work', 'invoke ce-work').pipe(
            Effect.provide(appLayer),
          )
          return { a, b, crossA, crossB }
        })),
      Then('project-a and project-b should each block only their own skill')((s) =>
        Effect.sync(() => {
          expect(s.result.a).not.toBeUndefined()
          expect(s.result.a?.skill).toBe('ce-work')
          expect(s.result.b).not.toBeUndefined()
          expect(s.result.b?.skill).toBe('other-skill')
          expect(s.result.crossA).toBeUndefined()
          expect(s.result.crossB).toBeUndefined()
        })
      ),
    ),
  )
})
