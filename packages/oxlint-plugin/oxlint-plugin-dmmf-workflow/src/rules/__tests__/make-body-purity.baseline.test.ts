import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { makeBodyPurity } from '../make-body-purity.js'
import { makeWorkflow, referenceError, UNRESOLVABLE_ACTUAL, UNRESOLVABLE_FIX } from './make-body-purity.fixtures.js'

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

ruleTester.run('make-body-purity', makeBodyPurity, {
  valid: [
    {
      name: 'Should_Pass_When_BodyReferencesARecordMemberAliasWhileTheUntouchedSiblingFails',
      code: makeWorkflow(
        `(x: number) => [registry.safe(x), pointer].length`,
        `const registry = { safe: (x: number): number => x, inner: { unsafe: (x: number): number => Math.random() * x } }
const pointer = registry.inner`,
      ),
    },
    {
      name: 'Should_Pass_When_BodyMutatesAContainerItDeclaresItself',
      code: makeWorkflow(`() => { const items: Array<number> = []; items.push(1); return items.length }`),
    },
    {
      name: 'Should_Pass_When_BodyReadsAnAliasedGetterOfAModuleRecord',
      code: makeWorkflow(
        `() => handle`,
        `const box = { get secret(): number { return Math.random() } }
const handle = box.secret`,
      ),
    },
    {
      name: 'Should_Pass_When_BodyReadsAnAliasOfAModuleGetterWhoseBodyIsImpure',
      code: makeWorkflow(
        `(x: number) => [helpers.safe(x), handle].length`,
        `const helpers = { safe: (x: number): number => x, get secret(): number { return Math.random() } }
const handle = helpers.secret`,
      ),
    },
    {
      name: 'Should_Pass_When_TheDecisionIgnoresAnImpureModuleHelper',
      code: makeWorkflow(
        `(x: number) => sneaky + x`,
        `import * as fs from 'node:fs'
const sneaky = 5
function unusedHelper(): string { return fs.readFileSync('/etc/hostname', 'utf-8') }`,
      ),
    },
  ],
  invalid: [
    {
      name: 'Should_ReportUnresolvable_When_BodyReferencesACatchClauseParameter',
      code: makeWorkflow(`() => { try { return 0 } catch (e) { return String(e) } }`),
      errors: [referenceError('unresolvableReference', 'a reference to e', UNRESOLVABLE_ACTUAL, UNRESOLVABLE_FIX)],
    },
    {
      name: 'Should_ReportUnresolvable_When_TheRecordMemberReturnsAFunctionTheBodyCalls',
      code: makeWorkflow(
        `(x: number) => helpers.make()(x)`,
        `const helpers = { make: (): ((n: number) => number) => Math.random }`,
      ),
      errors: [referenceError('unresolvableReference', 'a reference to Math', UNRESOLVABLE_ACTUAL, UNRESOLVABLE_FIX)],
    },
    {
      name: 'Should_ReportUnresolvable_When_BodyCallsThroughAConcreteMemberAlias',
      code: makeWorkflow(
        `(x: number) => [helpers.safe(x), trigger(x)].length`,
        `const helpers = { safe: (x: number): number => x, danger: (n: number): number => Math.random() * n }
const trigger = helpers.danger`,
      ),
      errors: [referenceError('unresolvableReference', 'a reference to Math', UNRESOLVABLE_ACTUAL, UNRESOLVABLE_FIX)],
    },
    {
      name: 'Should_ReportUnresolvable_When_BodyCallsThroughANestedMemberAlias',
      code: makeWorkflow(
        `(x: number) => [helpers.safe(x), trigger(x)].length`,
        `const helpers = { safe: (x: number): number => x, inner: { bad: (n: number): number => Math.random() * n } }
const trigger = helpers.inner.bad`,
      ),
      errors: [referenceError('unresolvableReference', 'a reference to Math', UNRESOLVABLE_ACTUAL, UNRESOLVABLE_FIX)],
    },
    {
      name: 'Should_ReportUnresolvable_When_BodyCallsADynamicMemberThroughAnAlias',
      code: makeWorkflow(
        `(x: number, key: string) => [helpers.safe(x), pick(key)].length`,
        `const helpers = { safe: (x: number): number => x, danger: (n: number): number => Math.random() * n }
const pick = helpers[key]`,
      ),
      errors: [referenceError('unresolvableReference', 'a reference to Math', UNRESOLVABLE_ACTUAL, UNRESOLVABLE_FIX)],
    },
    {
      name: 'Should_ReportUnresolvable_When_BodyReadsADynamicMemberOfANestedAlias',
      code: makeWorkflow(
        `(x: number, key: string) => [helpers.safe(x), alias[key]].length`,
        `const helpers = { safe: (x: number): number => x, inner: { bad: (n: number): number => Math.random() * n } }
const alias = helpers.inner`,
      ),
      errors: [referenceError('unresolvableReference', 'a reference to Math', UNRESOLVABLE_ACTUAL, UNRESOLVABLE_FIX)],
    },
    {
      name: 'Should_ReportUnresolvable_When_AModuleAliasChainReachesTheRecursionBudget',
      code: makeWorkflow(
        `(x: number) => Number(base.limit) + a8.bad(x)`,
        `const base = { limit: 1, bad: (n: number): number => Math.random() * n }
const a1 = base
const a2 = a1
const a3 = a2
const a4 = a3
const a5 = a4
const a6 = a5
const a7 = a6
const a8 = a7`,
      ),
      errors: [referenceError('unresolvableReference', 'a reference to Math', UNRESOLVABLE_ACTUAL, UNRESOLVABLE_FIX)],
    },
  ],
})
