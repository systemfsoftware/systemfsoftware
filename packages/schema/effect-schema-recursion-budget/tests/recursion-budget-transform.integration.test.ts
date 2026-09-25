import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

import { recursionBudgetTransform } from '@systemfsoftware/effect-schema-recursion-budget'
import { budgetToArbitrary } from '@systemfsoftware/effect-schema-recursion-budget/runtime'
import { Chain } from './__fixtures__/chain.schema.js'

const Feature = makeFeature({ it })

const RUNTIME_SPECIFIER = '@systemfsoftware/effect-schema-recursion-budget/runtime'

const MODULE_ID = '/repo/pkg/src/expr.schema.ts'

const ANNOTATED = `import { Schema as S } from 'effect'

export const Lit = S.TaggedStruct('Lit', { value: S.Finite })
export const Expr = S.suspend((): S.Schema<unknown> => S.Union([Lit])).annotate({
  identifier: 'Expr',
  recursionBudget: { maxDepth: 6, depthSize: 'small' },
})
`

const HAND_WRITTEN = `import { Schema as S } from 'effect'

export const Expr = S.suspend((): S.Schema<unknown> => S.Union([S.String])).annotate({
  recursionBudget: { maxDepth: 6, depthSize: 'small' },
  toCodecArbitrary: () => Schema.link<unknown>()(S.String, { decode: SchemaGetter.transform((x: unknown) => x), encode: SchemaGetter.transform((x: unknown) => x) }),

})
`

const NOTHING_TO_MATERIALIZE = `import { Schema as S } from 'effect'

export const Plain = S.String
export const UnionBudget = S.Union([S.String]).annotate({
  recursionBudget: { maxDepth: 6, depthSize: 'small' },
})
`

const processed = (source: string, moduleId: string = MODULE_ID): string | undefined =>
  recursionBudgetTransform().transform(source, moduleId)

const injectedSpecifierOf = (code: string | undefined): string => {
  const match = /__esRecursionBudget \} from '([^']+)'/.exec(code ?? '')
  if (match?.[1] === undefined) throw new Error('the processed module carries no runtime import')
  return match[1]
}

const injectedHookOf = (code: string | undefined): string => {
  const match = /toCodecArbitrary: __esRecursionBudget\(\(\) => Expr, \{ maxDepth: 6, depthSize: 'small' \}\)/.exec(
    code ?? '',
  )
  if (match === null) throw new Error('the processed module carries no generation hook for the declared budget')
  return match[0]
}

const loadFailureOf = (specifier: string): Effect.Effect<string> =>
  Effect.match(
    Effect.tryPromise({
      try: () => import(specifier),
      catch: (error) => (error instanceof Error ? error.message : 'a non-error value was thrown'),
    }),
    {
      onFailure: (message) => message,
      onSuccess: () => 'loaded',
    },
  )

Feature('Declaring a generation budget on a recursive schema').body(({ scenario }) => {
  scenario(
    'A recursive schema that declares its budget gains a generation hook',
    Gherkin.Do.pipe(
      Given('a schema module that declares a generation budget at its recursion point')(
        'source',
        () => Effect.succeed(ANNOTATED),
      ),
      When('the schema-laws pipeline processes that module')('code', (s) => Effect.sync(() => processed(s.source))),
      Then(
        'the processed module carries a generation hook bound to the schema declaration and imports the runtime module that builds it',
      )((s, expect) =>
        expect({
          hook: injectedHookOf(s.code),
          runtime: injectedSpecifierOf(s.code),
        }).toEqual({
          hook: `toCodecArbitrary: __esRecursionBudget(() => Expr, { maxDepth: 6, depthSize: 'small' })`,
          runtime: RUNTIME_SPECIFIER,
        })
      ),
    ),
  )

  scenario(
    'A hand-written derivation is never overwritten',
    Gherkin.Do.pipe(
      Given('a schema module that declares both a budget and its own generation hook')(
        'source',
        () => Effect.succeed(HAND_WRITTEN),
      ),
      When('the schema-laws pipeline processes that module')('code', (s) => Effect.sync(() => processed(s.source))),
      Then('the module reaches the runner exactly as it was written')((s, expect) => expect(s.code).toBeUndefined()),
    ),
  )

  scenario(
    'Modules with nothing to materialize pass through untouched',
    Gherkin.Do.pipe(
      Given('one module with no declared budget and one whose budget sits on a plain union')(
        'source',
        () => Effect.succeed(NOTHING_TO_MATERIALIZE),
      ),
      When('the schema-laws pipeline processes that module')('code', (s) => Effect.sync(() => processed(s.source))),
      Then('no hook is injected anywhere in it')((s, expect) => expect(s.code).toBeUndefined()),
    ),
  )

  scenario(
    'A leading toolchain directive stays at the top of the module',
    Gherkin.Do.pipe(
      Given('a schema module opening with a reference directive and declaring a budget')(
        'source',
        () => Effect.succeed(`/// <reference types="vitest/import-meta" />\n${ANNOTATED}`),
      ),
      When('the schema-laws pipeline processes that module')('code', (s) => Effect.sync(() => processed(s.source))),
      Then('the directive is still the first line of the module and the runtime import is inserted below it')((
        s,
        expect,
      ) =>
        expect({
          firstLine: s.code?.split('\n')[0],
          secondLine: injectedSpecifierOf(s.code?.split('\n')[1]),
        }).toEqual({
          firstLine: '/// <reference types="vitest/import-meta" />',
          secondLine: RUNTIME_SPECIFIER,
        })
      ),
    ),
  )

  scenario(
    'A consumer pipeline resolves the imported runtime module',
    Gherkin.Do.pipe(
      Given('a schema module that declares a generation budget at its recursion point')(
        'source',
        () => Effect.succeed(ANNOTATED),
      ),
      When('the schema-laws pipeline processes that module')('code', (s) => Effect.sync(() => processed(s.source))),
      Then(
        'the generated hook is imported from the runtime module the package ships and binds generation to the recursive union',
      )((s, expect) => {
        const hook = budgetToArbitrary(() => Chain, { maxDepth: 3, depthSize: 'small' })()
        return expect({
          importFrom: injectedSpecifierOf(s.code),
          boundTo: hook.to._tag,
        }).toEqual({ importFrom: RUNTIME_SPECIFIER, boundTo: 'Union' })
      }),
    ),
  )

  scenario(
    'A malformed budget refuses the module when it loads',
    { live: 'the schema module is loaded from a real file on disk by the module loader' },
    Gherkin.Do.pipe(
      Given('a schema module whose declared ceiling is not a whole number')(
        'fixture',
        () => Effect.succeed('./__fixtures__/bad-budget.schema.js'),
      ),
      When('that module is loaded')('failure', (s) => loadFailureOf(s.fixture)),
      Then('the load fails naming the recursion budget')((s, expect) =>
        expect(s.failure).toContain('recursionBudget: expected')
      ),
    ),
  )
})
