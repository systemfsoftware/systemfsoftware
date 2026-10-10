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
  ],
  invalid: [
    {
      name: 'Should_ReportUnresolvable_When_BodyReferencesACatchClauseParameter',
      code: makeWorkflow(`() => { try { return 0 } catch (e) { return String(e) } }`),
      errors: [referenceError('unresolvableReference', 'a reference to e', UNRESOLVABLE_ACTUAL, UNRESOLVABLE_FIX)],
    },
  ],
})
