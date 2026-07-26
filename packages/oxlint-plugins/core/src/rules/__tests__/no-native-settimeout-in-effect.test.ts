import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noNativeSetTimeoutInEffect } from '../no-native-settimeout-in-effect.js'

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

const setTimeoutError = {
  messageId: 'forbiddenSetTimeout' as const,
  data: { expected: 'Effect.delay or Effect.sleep' },
}

ruleTester.run('no-native-settimeout-in-effect', noNativeSetTimeoutInEffect, {
  valid: [
    // No effect import — setTimeout is allowed
    {
      name: 'allows setTimeout without effect import',
      code: `
        setTimeout(() => {}, 1000)
      `,
    },
    // Effect imported but no setTimeout usage
    {
      name: 'allows code with effect import but no setTimeout usage',
      code: `
        import { Effect } from 'effect'
        const x = Effect.succeed(42)
      `,
    },
    // Non-effect import does not trigger
    {
      name: 'allows setTimeout with non-effect import',
      code: `
        import { something } from 'other-lib'
        setTimeout(() => {}, 1000)
      `,
    },
    // setInterval is not banned by this rule
    {
      name: 'allows setInterval with effect import',
      code: `
        import { Effect } from 'effect'
        setInterval(() => {}, 1000)
      `,
    },
    // Other function calls
    {
      name: 'allows other function calls with effect import',
      code: `
        import { Effect } from 'effect'
        console.log('hello')
        Math.random()
      `,
    },
    // Variable alias that is NOT setTimeout — must not false-positive
    {
      name: 'allows non-setTimeout variable alias called in effect context',
      code: `
        import { Effect } from 'effect'
        const doStuff = () => {}
        doStuff()
      `,
    },
  ],
  invalid: [
    // Direct setTimeout
    {
      name: 'detects setTimeout() with effect import',
      code: `
        import { Effect } from 'effect'
        setTimeout(() => {}, 1000)
      `,
      errors: [setTimeoutError],
    },
    // effect/ sub-path import
    {
      name: 'detects setTimeout with effect/ sub-path import',
      code: `
        import { Duration } from 'effect/Duration'
        setTimeout(() => {}, 1000)
      `,
      errors: [setTimeoutError],
    },
    // @effect/ scoped import
    {
      name: 'detects setTimeout with @effect/ scoped import',
      code: `
        import { Schema } from '@effect/schema'
        setTimeout(() => {}, 1000)
      `,
      errors: [setTimeoutError],
    },
    // globalThis.setTimeout
    {
      name: 'detects globalThis.setTimeout() with effect import',
      code: `
        import { Effect } from 'effect'
        globalThis.setTimeout(() => {}, 1000)
      `,
      errors: [setTimeoutError],
    },
    // window.setTimeout
    {
      name: 'detects window.setTimeout() with effect import',
      code: `
        import { Effect } from 'effect'
        window.setTimeout(() => {}, 1000)
      `,
      errors: [setTimeoutError],
    },
    // self.setTimeout
    {
      name: 'detects self.setTimeout() with effect import',
      code: `
        import { Effect } from 'effect'
        self.setTimeout(() => {}, 1000)
      `,
      errors: [setTimeoutError],
    },
    // Bracket access: globalThis['setTimeout']
    {
      name: 'detects globalThis["setTimeout"]() with effect import',
      code: `
        import { Effect } from 'effect'
        globalThis['setTimeout'](() => {}, 1000)
      `,
      errors: [setTimeoutError],
    },
    // Bracket access: window['setTimeout']
    {
      name: 'detects window["setTimeout"]() with effect import',
      code: `
        import { Effect } from 'effect'
        window['setTimeout'](() => {}, 1000)
      `,
      errors: [setTimeoutError],
    },
    // Aliased setTimeout (assignment is not a call, so only alias call reports)
    {
      name: 'detects aliased setTimeout with effect import',
      code: `
        import { Effect } from 'effect'
        const myTimeout = setTimeout
        myTimeout(() => {}, 1000)
      `,
      errors: [setTimeoutError],
    },
    // Aliased from globalThis member
    {
      name: 'detects alias from globalThis.setTimeout',
      code: `
        import { Effect } from 'effect'
        const st = globalThis.setTimeout
        st(() => {}, 1000)
      `,
      errors: [setTimeoutError],
    },
    // Multiple setTimeout usages
    {
      name: 'detects multiple setTimeout usages',
      code: `
        import { Effect } from 'effect'
        setTimeout(() => {}, 1000)
        setTimeout(() => {}, 2000)
      `,
      errors: [setTimeoutError, setTimeoutError],
    },
    // Namespace import triggers
    {
      name: 'detects setTimeout with namespace import from effect',
      code: `
        import * as E from 'effect'
        setTimeout(() => {}, 1000)
      `,
      errors: [setTimeoutError],
    },
  ],
})
