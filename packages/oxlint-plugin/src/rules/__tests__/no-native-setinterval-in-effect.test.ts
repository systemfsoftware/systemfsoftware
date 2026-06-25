import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noNativeSetIntervalInEffect } from '../no-native-setinterval-in-effect.js'

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

const setIntervalError = {
  messageId: 'forbiddenSetInterval' as const,
  data: { expected: 'Effect.repeat with Schedule' },
}

const clearIntervalError = {
  messageId: 'forbiddenClearInterval' as const,
  data: { expected: 'Effect.fiberId + Fiber.interrupt' },
}

ruleTester.run('no-native-setinterval-in-effect', noNativeSetIntervalInEffect, {
  valid: [
    // No effect import — setInterval is allowed
    {
      name: 'allows setInterval without effect import',
      code: `
        setInterval(() => {}, 1000)
      `,
    },
    {
      name: 'allows clearInterval without effect import',
      code: `
        clearInterval(timerId)
      `,
    },
    // Effect imported but no interval usage
    {
      name: 'allows code with effect import but no interval usage',
      code: `
        import { Effect } from 'effect'
        const x = Effect.succeed(42)
      `,
    },
    // Non-effect import does not trigger
    {
      name: 'allows setInterval with non-effect import',
      code: `
        import { something } from 'other-lib'
        setInterval(() => {}, 1000)
      `,
    },
    // setTimeout is not banned
    {
      name: 'allows setTimeout with effect import',
      code: `
        import { Effect } from 'effect'
        setTimeout(() => {}, 1000)
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
    // Variable alias that is NOT interval — must not false-positive
    {
      name: 'allows non-interval variable alias called in effect context',
      code: `
        import { Effect } from 'effect'
        const doStuff = () => {}
        doStuff()
      `,
    },
  ],
  invalid: [
    // Direct setInterval
    {
      name: 'detects setInterval() with effect import',
      code: `
        import { Effect } from 'effect'
        setInterval(() => {}, 1000)
      `,
      errors: [setIntervalError],
    },
    // Direct clearInterval
    {
      name: 'detects clearInterval() with effect import',
      code: `
        import { Effect } from 'effect'
        clearInterval(timerId)
      `,
      errors: [clearIntervalError],
    },
    // effect/ sub-path import
    {
      name: 'detects setInterval with effect/ sub-path import',
      code: `
        import { Schedule } from 'effect/Schedule'
        setInterval(() => {}, 1000)
      `,
      errors: [setIntervalError],
    },
    // @effect/ scoped import
    {
      name: 'detects setInterval with @effect/ scoped import',
      code: `
        import { Schema } from '@effect/schema'
        setInterval(() => {}, 1000)
      `,
      errors: [setIntervalError],
    },
    // globalThis.setInterval
    {
      name: 'detects globalThis.setInterval() with effect import',
      code: `
        import { Effect } from 'effect'
        globalThis.setInterval(() => {}, 1000)
      `,
      errors: [setIntervalError],
    },
    // window.setInterval
    {
      name: 'detects window.setInterval() with effect import',
      code: `
        import { Effect } from 'effect'
        window.setInterval(() => {}, 1000)
      `,
      errors: [setIntervalError],
    },
    // self.setInterval
    {
      name: 'detects self.setInterval() with effect import',
      code: `
        import { Effect } from 'effect'
        self.setInterval(() => {}, 1000)
      `,
      errors: [setIntervalError],
    },
    // globalThis.clearInterval
    {
      name: 'detects globalThis.clearInterval() with effect import',
      code: `
        import { Effect } from 'effect'
        globalThis.clearInterval(timerId)
      `,
      errors: [clearIntervalError],
    },
    // Bracket access: globalThis['setInterval']
    {
      name: 'detects globalThis["setInterval"]() with effect import',
      code: `
        import { Effect } from 'effect'
        globalThis['setInterval'](() => {}, 1000)
      `,
      errors: [setIntervalError],
    },
    // Bracket access: window['clearInterval']
    {
      name: 'detects window["clearInterval"]() with effect import',
      code: `
        import { Effect } from 'effect'
        window['clearInterval'](timerId)
      `,
      errors: [clearIntervalError],
    },
    // Aliased setInterval (assignment is not a call, so only alias call reports)
    {
      name: 'detects aliased setInterval with effect import',
      code: `
        import { Effect } from 'effect'
        const myInterval = setInterval
        myInterval(() => {}, 1000)
      `,
      errors: [setIntervalError],
    },
    // Aliased clearInterval
    {
      name: 'detects aliased clearInterval with effect import',
      code: `
        import { Effect } from 'effect'
        const myClear = clearInterval
        myClear(timerId)
      `,
      errors: [clearIntervalError],
    },
    // Aliased from globalThis member
    {
      name: 'detects alias from globalThis.setInterval',
      code: `
        import { Effect } from 'effect'
        const si = globalThis.setInterval
        si(() => {}, 1000)
      `,
      errors: [setIntervalError],
    },
    // Both setInterval and clearInterval in same file
    {
      name: 'detects both setInterval and clearInterval',
      code: `
        import { Effect } from 'effect'
        const id = setInterval(() => {}, 1000)
        clearInterval(id)
      `,
      errors: [setIntervalError, clearIntervalError],
    },
    // Namespace import triggers
    {
      name: 'detects setInterval with namespace import from effect',
      code: `
        import * as E from 'effect'
        setInterval(() => {}, 1000)
      `,
      errors: [setIntervalError],
    },
  ],
})
