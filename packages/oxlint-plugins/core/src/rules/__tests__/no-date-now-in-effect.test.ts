import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noDateNowInEffect } from '../no-date-now-in-effect.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

const dateNowError = {
  messageId: 'forbiddenDateNow' as const,
  data: { expected: 'yield* Clock.currentTimeMillis (Clock from effect)' },
}

const prod = (code: string) => ({ code, filename: 'src/feature.ts' })

ruleTester.run('no-date-now-in-effect', noDateNowInEffect, {
  valid: [
    {
      name: 'allows Date.now() in a file that does not import effect',
      ...prod(`
        const now = Date.now()
        const later = Date.now() + 1000
      `),
    },
    {
      name: 'allows a now() call on a non-Date object',
      ...prod(`
        import { Effect } from 'effect'
        const t = performance.now()
      `),
    },
    {
      name: 'allows Clock.currentTimeMillis',
      ...prod(`
        import { Clock, Effect } from 'effect'
        const program = Effect.gen(function*() {
          const now = yield* Clock.currentTimeMillis
          return now
        })
      `),
    },
    {
      name: 'allows a different Date member',
      ...prod(`
        import { Effect } from 'effect'
        const program = Effect.gen(function*() {
          return new Date(0).toISOString()
        })
      `),
    },
    {
      name: 'skips test scaffolding files where clock-as-salt is legitimate',
      code: `
        import { Effect } from 'effect'
        const layer = Effect.gen(function*() {
          const salt = Date.now()
          return salt
        })
      `,
      filename: 'packages/lib/statement-store/test/runtime/ppn-runtime.ts',
    },
  ],
  invalid: [
    {
      name: 'detects Date.now() directly in an Effect.gen body',
      ...prod(`
        import { Effect } from 'effect'
        const program = Effect.gen(function*() {
          const now = Date.now()
          return now
        })
      `),
      errors: [dateNowError],
    },
    {
      name: 'detects Date.now() lifted via Effect.sync — not an escape hatch',
      ...prod(`
        import { Effect } from 'effect'
        const now = Effect.sync(() => Date.now())
      `),
      errors: [dateNowError],
    },
    {
      name: 'detects Date.now() in a plain handler arrow within an effect-importing file',
      ...prod(`
        import { Effect } from 'effect'
        const makeRoute = Effect.gen(function*() {
          const isRateLimited = (ip: string) => {
            const now = Date.now()
            return now > 0
          }
          return isRateLimited
        })
      `),
      errors: [dateNowError],
    },
    {
      name: 'detects Date.now() with effect/ sub-path import',
      ...prod(`
        import { Duration } from 'effect/Duration'
        const t = Date.now()
      `),
      errors: [dateNowError],
    },
    {
      name: 'detects Date.now() with @effect/ scoped import',
      ...prod(`
        import { Schema } from '@effect/schema'
        const t = Date.now()
      `),
      errors: [dateNowError],
    },
    {
      name: 'detects bracket-access Date["now"]()',
      ...prod(`
        import { Effect } from 'effect'
        const t = Date['now']()
      `),
      errors: [dateNowError],
    },
    {
      name: 'detects Math.floor(Date.now() / 1000)',
      ...prod(`
        import { Effect } from 'effect'
        const program = Effect.gen(function*() {
          return Math.floor(Date.now() / 1000)
        })
      `),
      errors: [dateNowError],
    },
    {
      name: 'detects multiple Date.now() usages',
      ...prod(`
        import { Effect } from 'effect'
        const a = Date.now()
        const b = Date.now()
      `),
      errors: [dateNowError, dateNowError],
    },
    {
      name: 'detects Date.now() with namespace import from effect',
      ...prod(`
        import * as E from 'effect'
        const t = Date.now()
      `),
      errors: [dateNowError],
    },
  ],
})
