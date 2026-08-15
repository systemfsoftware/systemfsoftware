import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec-v4'
import { Effect, Option } from 'effect'
import { expect } from 'vitest'
import * as Atom from '../src/Atom.js'
import * as Registry from '../src/Registry.js'
import * as Result from '../src/Result.js'

const Feature = makeFeature({ it, layer })

Feature('Keeping the last good answer on screen when a retry fails')
  .body(({ scenario }) => {
    scenario(
      'A page keeps showing the previous answer after a refresh fails',
      Gherkin.Do.pipe(
        Given('a calculation that succeeds the first time and fails on every retry')('ctx', () =>
          Effect.sync(() => {
            let attempt = 0
            const atom = Atom.make(Effect.suspend(() => {
              attempt++
              return attempt === 1 ? Effect.succeed(10) : Effect.fail('server unavailable' as const)
            }))
            const page = Registry.make()
            return { page, atom }
          })),
        When('the value is read, the page is refreshed, and the value is read again')(
          'reading',
          (s) =>
            Effect.sync(() => {
              s.ctx.page.get(s.ctx.atom)
              s.ctx.page.refresh(s.ctx.atom)
              return s.ctx.page.get(s.ctx.atom)
            }),
        ),
        Then('the refresh reports a failure, but the previous answer is still remembered')((s) => {
          expect(Result.isFailure(s.reading)).toBe(true)
          expect(Result.isFailure(s.reading) && Option.isSome(s.reading.previousSuccess)).toBe(true)
        }),
      ),
    )

    scenario(
      'A calculation that has never succeeded has no previous answer to fall back on',
      Gherkin.Do.pipe(
        Given('a calculation that always fails')('ctx', () =>
          Effect.sync(() => {
            const atom = Atom.make(Effect.fail('server unavailable' as const))
            const page = Registry.make()
            return { page, atom }
          })),
        When('the value is read for the first time')('reading', (s) => Effect.sync(() => s.ctx.page.get(s.ctx.atom))),
        Then('the failure carries no previous answer')((s) => {
          expect(Result.isFailure(s.reading) && Option.isNone(s.reading.previousSuccess)).toBe(true)
        }),
      ),
    )
  })
