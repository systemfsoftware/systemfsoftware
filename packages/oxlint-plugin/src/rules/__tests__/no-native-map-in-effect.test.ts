import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noNativeMapInEffect } from '../no-native-map-in-effect.js'

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

const defaultExpected = 'HashMap from effect (HashMap.empty() or HashMap.fromIterable())'
const defaultFix =
  'Replace with HashMap.empty() for empty maps, or HashMap.fromIterable(iterable) for maps with initial data'

const forbiddenMapError = (actual: string) => ({
  messageId: 'forbiddenMap' as const,
  data: {
    expected: defaultExpected,
    actual,
    fix: defaultFix,
  },
})

ruleTester.run('no-native-map-in-effect', noNativeMapInEffect, {
  valid: [
    // No effect import — Map is allowed
    {
      name: 'allows new Map() without effect import',
      code: `
        const m = new Map()
      `,
    },
    {
      name: 'allows new Map(entries) without effect import',
      code: `
        const m = new Map([['a', 1]])
      `,
    },
    // Effect imported but no Map usage
    {
      name: 'allows code with effect import but no Map',
      code: `
        import { Effect } from 'effect'
        const x = Effect.succeed(42)
      `,
    },
    // Non-effect import does not trigger
    {
      name: 'allows new Map() with non-effect import',
      code: `
        import { something } from 'other-lib'
        const m = new Map()
      `,
    },
    // Allow list
    {
      name: 'allows Map when in allow list',
      code: `
        import { Effect } from 'effect'
        Effect.gen(function*() {
          const m = new Map()
        })
      `,
      options: [{ allow: ['Map'] }],
    },
    // HashMap usage is fine
    {
      name: 'allows HashMap.empty() with effect import',
      code: `
        import { HashMap } from 'effect'
        const m = HashMap.empty()
      `,
    },
    // Non-Map constructor
    {
      name: 'allows new Set() with effect import',
      code: `
        import { Effect } from 'effect'
        const s = new Set()
      `,
    },
    {
      name: 'allows new WeakMap() with effect import',
      code: `
        import { Effect } from 'effect'
        const m = new WeakMap()
      `,
    },
    // Effect imported but Map is outside Effect.gen — allowed
    {
      name: 'allows new Map() outside Effect.gen with effect import',
      code: `
        import { Effect } from 'effect'
        const m = new Map([['a', 1]])
        const program = Effect.gen(function*() {
          yield* Effect.succeed(m)
        })
      `,
    },
    {
      name: 'allows new Map() in plain function with effect import',
      code: `
        import { Effect } from 'effect'
        function makeMap() {
          return new Map([['a', 1]])
        }
      `,
    },
    // Non-effect .gen() call — hasEffectImport guard prevents false positive
    {
      name: 'allows new Map() inside non-effect .gen() call',
      code: `
        import { something } from 'other-lib'
        const obj = { gen: (f: any) => f() }
        obj.gen(function*() {
          const m = new Map()
        })
      `,
    },
    // Non-Map constructor inside Effect.gen — isMapCallee guard prevents false positive
    {
      name: 'allows new Set() inside Effect.gen',
      code: `
        import { Effect } from 'effect'
        Effect.gen(function*() {
          const s = new Set()
        })
      `,
    },
  ],
  invalid: [
    // Basic: new Map() inside Effect.gen
    {
      name: 'detects new Map() inside Effect.gen',
      code: `
        import { Effect } from 'effect'
        Effect.gen(function*() {
          const m = new Map()
        })
      `,
      errors: [forbiddenMapError('new Map()')],
    },
    // new Map(iterable) inside Effect.gen
    {
      name: 'detects new Map(iterable) inside Effect.gen',
      code: `
        import { Effect } from 'effect'
        Effect.gen(function*() {
          const m = new Map([['a', 1]])
        })
      `,
      errors: [forbiddenMapError('new Map(iterable)')],
    },
    // effect/ sub-path import
    {
      name: 'detects new Map() inside Effect.gen with effect/ sub-path import',
      code: `
        import { HashMap } from 'effect/HashMap'
        import { Effect } from 'effect/Effect'
        Effect.gen(function*() {
          const m = new Map()
        })
      `,
      errors: [forbiddenMapError('new Map()')],
    },
    // @effect/ scoped import
    {
      name: 'detects new Map() inside Effect.gen with @effect/ scoped import',
      code: `
        import { Schema } from '@effect/schema'
        const Effect = { gen: (f: any) => f() }
        Effect.gen(function*() {
          const m = new Map()
        })
      `,
      errors: [forbiddenMapError('new Map()')],
    },
    // globalThis.Map inside Effect.gen
    {
      name: 'detects new globalThis.Map() inside Effect.gen',
      code: `
        import { Effect } from 'effect'
        Effect.gen(function*() {
          const m = new globalThis.Map()
        })
      `,
      errors: [forbiddenMapError('new Map()')],
    },
    // window.Map inside Effect.gen
    {
      name: 'detects new window.Map() inside Effect.gen',
      code: `
        import { Effect } from 'effect'
        Effect.gen(function*() {
          const m = new window.Map()
        })
      `,
      errors: [forbiddenMapError('new Map()')],
    },
    // Multiple Map usages inside Effect.gen
    {
      name: 'detects multiple Map usages inside Effect.gen',
      code: `
        import { Effect } from 'effect'
        Effect.gen(function*() {
          const a = new Map()
          const b = new Map([['x', 1]])
        })
      `,
      errors: [
        forbiddenMapError('new Map()'),
        forbiddenMapError('new Map(iterable)'),
      ],
    },
    // Custom messages
    {
      name: 'uses custom expected and fix messages',
      code: `
        import { Effect } from 'effect'
        Effect.gen(function*() {
          const m = new Map()
        })
      `,
      options: [{ expected: 'custom expected', fix: 'custom fix' }],
      errors: [{
        messageId: 'forbiddenMap' as const,
        data: {
          expected: 'custom expected',
          actual: 'new Map()',
          fix: 'custom fix',
        },
      }],
    },
    // namespace import triggers
    {
      name: 'detects new Map() inside Effect.gen with namespace import',
      code: `
        import * as E from 'effect'
        E.gen(function*() {
          const m = new Map()
        })
      `,
      errors: [forbiddenMapError('new Map()')],
    },
    // Stream.gen also triggers
    {
      name: 'detects new Map() inside Stream.gen',
      code: `
        import { Stream } from 'effect'
        Stream.gen(function*() {
          const m = new Map()
        })
      `,
      errors: [forbiddenMapError('new Map()')],
    },
    // Nested inside Effect.gen
    {
      name: 'detects new Map() nested inside Effect.gen',
      code: `
        import { Effect } from 'effect'
        const program = Effect.gen(function*() {
          const entries = [['a', 1]]
          const m = new Map(entries)
          return m
        })
      `,
      errors: [forbiddenMapError('new Map(iterable)')],
    },
  ],
})
