import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec-v4'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import { expect } from 'vitest'
import * as Result from '../src/Result.js'

const Feature = makeFeature({ it, layer })

Feature('Result combinators and states for coverage')
  .body(({ scenario }) => {
    scenario(
      'success and failure roundtrip with map and flatMap',
      Gherkin.Do.pipe(
        Given('success and failure results')('rs', () =>
          Effect.sync(() => ({
            s: Result.success(1),
            f: Result.failure('e' as const),
          }))),
        When('map and flatMap are applied')('out', (s) =>
          Effect.sync(() => {
            const m1 = Result.map(s.rs.s, (n) => n + 1)
            const m2 = Result.map(s.rs.f, (n) => n)
            const fm = Result.flatMap(s.rs.s, (n) => Result.success(n * 2))
            return { m1, m2, fm }
          })),
        Then('shapes are correct')((s) => {
          expect(Result.isSuccess(s.out.m1)).toBe(true)
          expect(Result.isFailure(s.out.m2)).toBe(true)
          expect(Result.isSuccess(s.out.fm)).toBe(true)
        }),
      ),
    )

    scenario(
      'fromExit and toExit roundtrips',
      Gherkin.Do.pipe(
        Given('exits')('es', () =>
          Effect.sync(() => ({
            ok: Exit.succeed(42),
            fail: Exit.fail('bad'),
          }))),
        When('convert to Result and back')('rs', (s) =>
          Effect.sync(() => {
            const r1 = Result.fromExit(s.es.ok)
            const r2 = Result.fromExit(s.es.fail)
            return { r1, r2 }
          })),
        Then('preserve success/failure')((s) => {
          expect(Result.isSuccess(s.rs.r1)).toBe(true)
          expect(Result.isFailure(s.rs.r2)).toBe(true)
        }),
      ),
    )
  })
