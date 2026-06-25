import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noNewPromiseInEffect } from '../no-new-promise-in-effect.js'

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

const newPromiseError = {
  messageId: 'forbiddenNewPromise' as const,
  data: {
    expected: 'Effect.async or Promise.withResolvers',
    actual: 'new Promise(executor)',
    fix: 'Replace with Effect.async for Effect pipelines, or Promise.withResolvers for native Promise composition',
  },
}

ruleTester.run('no-new-promise-in-effect', noNewPromiseInEffect, {
  valid: [
    // No effect import — new Promise is allowed
    {
      name: 'allows new Promise without effect import',
      code: `
        new Promise((resolve, reject) => { resolve(42) })
      `,
    },
    // Effect imported but no new Promise usage
    {
      name: 'allows code with effect import but no new Promise',
      code: `
        import { Effect } from 'effect'
        const x = Effect.succeed(42)
      `,
    },
    // Non-effect import does not trigger
    {
      name: 'allows new Promise with non-effect import',
      code: `
        import { something } from 'other-lib'
        new Promise((resolve) => { resolve(1) })
      `,
    },
    // Promise.resolve / Promise.all are not constructors
    {
      name: 'allows Promise.resolve with effect import',
      code: `
        import { Effect } from 'effect'
        Promise.resolve(42)
        Promise.all([])
      `,
    },
    // new Promise() with no arguments (bare constructor)
    {
      name: 'allows new Promise() with no arguments and effect import',
      code: `
        import { Effect } from 'effect'
        new Promise()
      `,
    },
    // new Promise with non-function argument
    {
      name: 'allows new Promise with non-function argument',
      code: `
        import { Effect } from 'effect'
        new Promise(someVariable)
      `,
    },
    // Other constructors are fine
    {
      name: 'allows other constructors with effect import',
      code: `
        import { Effect } from 'effect'
        new Map()
        new Set()
        new Error('oops')
      `,
    },
  ],
  invalid: [
    // Arrow function executor
    {
      name: 'detects new Promise with arrow executor and effect import',
      code: `
        import { Effect } from 'effect'
        new Promise((resolve, reject) => { resolve(42) })
      `,
      errors: [newPromiseError],
    },
    // Function expression executor
    {
      name: 'detects new Promise with function expression executor',
      code: `
        import { Effect } from 'effect'
        new Promise(function(resolve, reject) { resolve(42) })
      `,
      errors: [newPromiseError],
    },
    // effect/ sub-path import
    {
      name: 'detects new Promise with effect/ sub-path import',
      code: `
        import { Duration } from 'effect/Duration'
        new Promise((resolve) => { resolve(1) })
      `,
      errors: [newPromiseError],
    },
    // @effect/ scoped import
    {
      name: 'detects new Promise with @effect/ scoped import',
      code: `
        import { Schema } from '@effect/schema'
        new Promise((resolve) => { resolve(1) })
      `,
      errors: [newPromiseError],
    },
    // Namespace import triggers
    {
      name: 'detects new Promise with namespace import from effect',
      code: `
        import * as E from 'effect'
        new Promise((resolve) => { resolve(1) })
      `,
      errors: [newPromiseError],
    },
    // Resolve-only arrow
    {
      name: 'detects new Promise with single-param arrow',
      code: `
        import { Effect } from 'effect'
        new Promise((resolve) => resolve(42))
      `,
      errors: [newPromiseError],
    },
    // Multiple new Promise usages
    {
      name: 'detects multiple new Promise usages',
      code: `
        import { Effect } from 'effect'
        new Promise((resolve) => resolve(1))
        new Promise((resolve, reject) => { reject(new Error('fail')) })
      `,
      errors: [newPromiseError, newPromiseError],
    },
    // Async executor (still banned)
    {
      name: 'detects new Promise with async arrow executor',
      code: `
        import { Effect } from 'effect'
        new Promise(async (resolve) => { resolve(await fetch('/api')) })
      `,
      errors: [newPromiseError],
    },
  ],
})
