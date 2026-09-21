import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noNativeSetInEffect } from '../no-native-set-in-effect.js'

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

const defaultExpected = 'HashSet from effect (HashSet.empty() or HashSet.fromIterable())'
const defaultFix =
  'Replace with HashSet.empty() for empty sets, or HashSet.fromIterable(iterable) for sets with initial data'

const forbiddenSetError = (actual: string) => ({
  messageId: 'forbiddenSet' as const,
  data: {
    expected: defaultExpected,
    actual,
    fix: defaultFix,
  },
})

ruleTester.run('no-native-set-in-effect', noNativeSetInEffect, {
  valid: [
    // No effect import — Set is allowed
    {
      name: 'allows new Set() without effect import',
      code: `
        const s = new Set()
      `,
    },
    {
      name: 'allows new Set(iterable) without effect import',
      code: `
        const s = new Set([1, 2, 3])
      `,
    },
    // Effect imported but no Set usage
    {
      name: 'allows code with effect import but no Set',
      code: `
        import { Effect } from 'effect'
        const x = Effect.succeed(42)
      `,
    },
    // Non-effect import does not trigger
    {
      name: 'allows new Set() with non-effect import',
      code: `
        import { something } from 'other-lib'
        const s = new Set()
      `,
    },
    // Allow list
    {
      name: 'allows Set when in allow list',
      code: `
        import { Effect } from 'effect'
        Effect.gen(function*() {
          const s = new Set()
        })
      `,
      options: [{ allow: ['Set'] }],
    },
    // HashSet usage is fine
    {
      name: 'allows HashSet.empty() with effect import',
      code: `
        import { HashSet } from 'effect'
        const s = HashSet.empty()
      `,
    },
    // Non-Set constructors
    {
      name: 'allows new Map() with effect import',
      code: `
        import { Effect } from 'effect'
        const m = new Map()
      `,
    },
    {
      name: 'allows new WeakSet() with effect import',
      code: `
        import { Effect } from 'effect'
        const s = new WeakSet()
      `,
    },
    // Effect imported but Set is outside Effect.gen — allowed
    {
      name: 'allows new Set() outside Effect.gen with effect import',
      code: `
        import { Effect } from 'effect'
        const s = new Set([1, 2, 3])
        const program = Effect.gen(function*() {
          yield* Effect.succeed(s)
        })
      `,
    },
    {
      name: 'allows new Set() in Config.map with effect import',
      code: `
        import { Config } from 'effect'
        const ids = Config.map(Config.array(Config.string(), 'IDS'), (a) => new Set(a))
      `,
    },
    {
      name: 'allows new Set() in plain function with effect import',
      code: `
        import { Effect } from 'effect'
        function makeSet() {
          return new Set([1, 2, 3])
        }
      `,
    },
    // Non-effect .gen() call — hasEffectImport guard prevents false positive
    {
      name: 'allows new Set() inside non-effect .gen() call',
      code: `
        import { something } from 'other-lib'
        const obj = { gen: (f: any) => f() }
        obj.gen(function*() {
          const s = new Set()
        })
      `,
    },
    // Non-Set constructor inside Effect.gen — isSetCallee guard prevents false positive
    {
      name: 'allows new Map() inside Effect.gen',
      code: `
        import { Effect } from 'effect'
        Effect.gen(function*() {
          const m = new Map()
        })
      `,
    },
  ],
  invalid: [
    // Basic: new Set() inside Effect.gen
    {
      name: 'detects new Set() inside Effect.gen',
      code: `
        import { Effect } from 'effect'
        Effect.gen(function*() {
          const s = new Set()
        })
      `,
      errors: [forbiddenSetError('new Set()')],
    },
    // new Set(iterable) inside Effect.gen
    {
      name: 'detects new Set(iterable) inside Effect.gen',
      code: `
        import { Effect } from 'effect'
        Effect.gen(function*() {
          const s = new Set([1, 2, 3])
        })
      `,
      errors: [forbiddenSetError('new Set(iterable)')],
    },
    // effect/ sub-path import
    {
      name: 'detects new Set() inside Effect.gen with effect/ sub-path import',
      code: `
        import { HashSet } from 'effect/HashSet'
        import { Effect } from 'effect/Effect'
        Effect.gen(function*() {
          const s = new Set()
        })
      `,
      errors: [forbiddenSetError('new Set()')],
    },
    // @effect/ scoped import
    {
      name: 'detects new Set() inside Effect.gen with @effect/ scoped import',
      code: `
        import { Schema } from '@effect/schema'
        const Effect = { gen: (f: any) => f() }
        Effect.gen(function*() {
          const s = new Set()
        })
      `,
      errors: [forbiddenSetError('new Set()')],
    },
    // Multiple Set usages inside Effect.gen
    {
      name: 'detects multiple Set usages inside Effect.gen',
      code: `
        import { Effect } from 'effect'
        Effect.gen(function*() {
          const a = new Set()
          const b = new Set([1, 2])
        })
      `,
      errors: [
        forbiddenSetError('new Set()'),
        forbiddenSetError('new Set(iterable)'),
      ],
    },
    // Custom messages
    {
      name: 'uses custom expected and fix messages',
      code: `
        import { Effect } from 'effect'
        Effect.gen(function*() {
          const s = new Set()
        })
      `,
      options: [{ expected: 'custom expected', fix: 'custom fix' }],
      errors: [{
        messageId: 'forbiddenSet' as const,
        data: {
          expected: 'custom expected',
          actual: 'new Set()',
          fix: 'custom fix',
        },
      }],
    },
    // namespace import triggers
    {
      name: 'detects new Set() inside Effect.gen with namespace import',
      code: `
        import * as E from 'effect'
        E.gen(function*() {
          const s = new Set()
        })
      `,
      errors: [forbiddenSetError('new Set()')],
    },
    // Stream.gen also triggers
    {
      name: 'detects new Set() inside Stream.gen',
      code: `
        import { Stream } from 'effect'
        Stream.gen(function*() {
          const s = new Set()
        })
      `,
      errors: [forbiddenSetError('new Set()')],
    },
    // Layer.gen also triggers
    {
      name: 'detects new Set() inside Layer.gen',
      code: `
        import { Layer } from 'effect'
        Layer.gen(function*() {
          const s = new Set()
        })
      `,
      errors: [forbiddenSetError('new Set()')],
    },
    // Nested inside Effect.gen callback
    {
      name: 'detects new Set() nested inside Effect.gen arrow function',
      code: `
        import { Effect } from 'effect'
        const program = Effect.gen(function*() {
          const items = [1, 2, 3]
          const s = new Set(items)
          return s
        })
      `,
      errors: [forbiddenSetError('new Set(iterable)')],
    },
  ],
})
