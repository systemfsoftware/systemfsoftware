import * as NodePath from '@effect/platform-node-shared/NodePath'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect, Layer } from 'effect'
import { afterEach, expect } from 'vitest'
import { __resetNoInjectRefsForTesting, NoInjectRefs, NoInjectRefsLive } from '../../src/inject/no-inject-refs.js'
import { warmHarnessPolicy } from '../../src/runtime.js'

const Feature = makeFeature({ it, layer })

afterEach(() => {
  __resetNoInjectRefsForTesting()
})

Feature('Warm harness policy — per-cwd isolation and last-write-wins').body(({ scenario }) => {
  scenario(
    'Should isolate per-cwd no_inject_refs after warming two cwds',
    Gherkin.Do.pipe(
      Given('a memfs with two distinct tomls')('ctx', () =>
        Effect.succeed({
          contents: {
            '/project-a/systemfsoftware.toml': 'no_inject_refs = ["CUSTOM_A.md"]',
            '/project-b/systemfsoftware.toml': 'no_inject_refs = ["CUSTOM_B.md"]',
          } as const,
          cwdA: '/project-a' as const,
          cwdB: '/project-b' as const,
        })),
      When('both cwds are warmed and per-cwd load is queried')('result', (s) =>
        Effect.gen(function*() {
          const fsLayer = MemoryFileSystem.layerWith(s.ctx.contents).pipe(Layer.provideMerge(NodePath.layer))
          const live = Layer.mergeAll(NoInjectRefsLive, fsLayer)

          yield* warmHarnessPolicy(s.ctx.cwdA).pipe(Effect.provide(live))
          yield* warmHarnessPolicy(s.ctx.cwdB).pipe(Effect.provide(live))

          const a = yield* Effect.flatMap(NoInjectRefs, (svc) => svc.load(s.ctx.cwdA)).pipe(Effect.provide(live))
          const b = yield* Effect.flatMap(NoInjectRefs, (svc) => svc.load(s.ctx.cwdB)).pipe(Effect.provide(live))

          const aGet = yield* Effect.flatMap(NoInjectRefs, (svc) => Effect.sync(() => svc.get(s.ctx.cwdA))).pipe(
            Effect.provide(live),
          )
          const bGet = yield* Effect.flatMap(NoInjectRefs, (svc) => Effect.sync(() => svc.get(s.ctx.cwdB))).pipe(
            Effect.provide(live),
          )

          return { a, b, aGet, bGet }
        })),
      Then('each cwd should return its own warmed config')((s) =>
        Effect.sync(() => {
          expect(s.result.a).toEqual(['CUSTOM_A.md'])
          expect(s.result.b).toEqual(['CUSTOM_B.md'])
          expect(s.result.aGet).toEqual(['CUSTOM_A.md'])
          expect(s.result.bGet).toEqual(['CUSTOM_B.md'])
        })
      ),
    ),
  )

  scenario(
    'Should return default for an unwarmed cwd',
    Gherkin.Do.pipe(
      Given('a memfs with one toml and an unwarmed cwd')('ctx', () =>
        Effect.succeed({
          contents: {
            '/project-a/systemfsoftware.toml': 'no_inject_refs = ["CUSTOM_A.md"]',
          } as const,
          warmed: '/project-a' as const,
          unwarmed: '/project-b' as const,
        })),
      When('only one cwd is warmed and the other is queried')('result', (s) =>
        Effect.gen(function*() {
          const fsLayer = MemoryFileSystem.layerWith(s.ctx.contents).pipe(Layer.provideMerge(NodePath.layer))
          const live = Layer.mergeAll(NoInjectRefsLive, fsLayer)

          yield* warmHarnessPolicy(s.ctx.warmed).pipe(Effect.provide(live))

          const unwarmedLoad = yield* Effect.flatMap(NoInjectRefs, (svc) => svc.load(s.ctx.unwarmed)).pipe(
            Effect.provide(live),
          )
          const unwarmedGet = yield* Effect.flatMap(NoInjectRefs, (svc) => Effect.sync(() => svc.get(s.ctx.unwarmed)))
            .pipe(Effect.provide(live))

          return { unwarmedLoad, unwarmedGet }
        })),
      Then('the unwarmed cwd should fall back to the default skip list')((s) =>
        Effect.sync(() => {
          expect(s.result.unwarmedLoad).toEqual(['AGENTS.md'])
          expect(s.result.unwarmedGet).toEqual(['AGENTS.md'])
        })
      ),
    ),
  )

  scenario(
    'Should let a second warm of the same cwd win (last-write-wins)',
    Gherkin.Do.pipe(
      Given('a memfs with two successive tomls for the same cwd')('ctx', () =>
        Effect.succeed({
          cwd: '/project-a' as const,
          firstContents: {
            '/project-a/systemfsoftware.toml': 'no_inject_refs = ["FIRST.md"]',
          } as const,
          secondContents: {
            '/project-a/systemfsoftware.toml': 'no_inject_refs = ["SECOND.md"]',
          } as const,
        })),
      When('the same cwd is warmed twice with different configs')('result', (s) =>
        Effect.gen(function*() {
          const firstLayer = MemoryFileSystem.layerWith(s.ctx.firstContents).pipe(Layer.provideMerge(NodePath.layer))
          const firstLive = Layer.mergeAll(NoInjectRefsLive, firstLayer)
          yield* warmHarnessPolicy(s.ctx.cwd).pipe(Effect.provide(firstLive))

          const secondLayer = MemoryFileSystem.layerWith(s.ctx.secondContents).pipe(Layer.provideMerge(NodePath.layer))
          const secondLive = Layer.mergeAll(NoInjectRefsLive, secondLayer)
          yield* warmHarnessPolicy(s.ctx.cwd).pipe(Effect.provide(secondLive))

          const final = yield* Effect.flatMap(NoInjectRefs, (svc) => svc.load(s.ctx.cwd)).pipe(
            Effect.provide(secondLive),
          )
          const finalGet = yield* Effect.flatMap(NoInjectRefs, (svc) => Effect.sync(() => svc.get(s.ctx.cwd))).pipe(
            Effect.provide(secondLive),
          )

          return { final, finalGet }
        })),
      Then('the second config should win')((s) =>
        Effect.sync(() => {
          expect(s.result.final).toEqual(['SECOND.md'])
          expect(s.result.finalGet).toEqual(['SECOND.md'])
        })
      ),
    ),
  )
})
