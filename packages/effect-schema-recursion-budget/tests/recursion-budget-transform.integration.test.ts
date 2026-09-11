import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { existsSync } from 'node:fs'
import { expect } from 'vitest'

import { RECURSION_BUDGET_VIRTUAL_ID, recursionBudgetTransform } from '@systemfsoftware/effect-schema-recursion-budget'

const Feature = makeFeature({ it, layer })

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
  toArbitrary: () => () => fc.constant('x'),
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

const loadFailureOf = async (specifier: string): Promise<string> => {
  try {
    await import(specifier)
    return 'loaded'
  } catch (error) {
    return error instanceof Error ? error.message : 'a non-error value was thrown'
  }
}

Feature('Declaring a generation budget on a recursive schema').body(({ scenario }) => {
  scenario(
    'A recursive schema that declares its budget gains a generation hook',
    Gherkin.Do.pipe(
      Given('a schema module that declares a generation budget at its recursion point')(
        'source',
        () => Effect.succeed(ANNOTATED),
      ),
      When('the schema-laws pipeline processes that module')('code', (s) => Effect.sync(() => processed(s.source))),
      Then('the processed module carries a generation hook bound to the schema declaration')((s) => {
        expect(s.code).toContain(
          `toArbitrary: __esRecursionBudget(() => Expr, { maxDepth: 6, depthSize: 'small' }, "${MODULE_ID}#Expr")`,
        )
      }),
      Then('the hook arrives from the recursion-budget runtime module')((s) => {
        expect(s.code).toContain(`from '${RECURSION_BUDGET_VIRTUAL_ID}'`)
      }),
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
      Then('the module reaches the runner exactly as it was written')((s) => {
        expect(s.code).toBeUndefined()
      }),
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
      Then('no hook is injected anywhere in it')((s) => {
        expect(s.code).toBeUndefined()
      }),
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
      Then('the directive is still the first line of the module')((s) => {
        expect(s.code?.startsWith('/// <reference types="vitest/import-meta" />')).toBe(true)
      }),
      Then('the runtime import is inserted below it')((s) => {
        expect(s.code?.split('\n')[1]).toContain(RECURSION_BUDGET_VIRTUAL_ID)
      }),
    ),
  )

  scenario(
    'The hook import resolves to the runtime module the package ships',
    Gherkin.Do.pipe(
      Given('the schema-laws pipeline asking for its runtime module')(
        'plugin',
        () => Effect.succeed(recursionBudgetTransform()),
      ),
      When('it resolves the recursion-budget runtime specifier')(
        'resolved',
        (s) => Effect.sync(() => s.plugin.resolveId(RECURSION_BUDGET_VIRTUAL_ID)),
      ),
      Then('a runtime module on disk answers that specifier')((s) => {
        expect(s.resolved).toMatch(/recursion-budget-runtime\.(ts|mjs)$/)
        expect(s.resolved === null ? false : existsSync(s.resolved)).toBe(true)
      }),
      Then('an unrelated specifier is left to the rest of the pipeline')((s) => {
        expect(s.plugin.resolveId('effect')).toBeNull()
      }),
    ),
  )

  scenario(
    'A malformed budget refuses the module when it loads',
    Gherkin.Do.pipe(
      Given('a schema module whose declared ceiling is not a whole number')(
        'fixture',
        () => Effect.succeed('./__fixtures__/bad-budget.schema.js'),
      ),
      When('that module is loaded')('failure', (s) => Effect.promise(() => loadFailureOf(s.fixture))),
      Then('the load fails naming the recursion budget')((s) => {
        expect(s.failure).toContain('recursionBudget: expected')
      }),
    ),
  )
})
