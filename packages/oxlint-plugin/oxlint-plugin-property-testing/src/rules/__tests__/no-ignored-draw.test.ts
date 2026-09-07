import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { GUARD, GUARD_END, NO_IGNORED_DRAW_INVALID } from '../no-ignored-draw.corpus.js'
import { noIgnoredDraw } from '../no-ignored-draw.js'

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

const FILENAME = 'src/ProbeString.property.test.ts'

ruleTester.run('no-ignored-draw', noIgnoredDraw, {
  valid: [
    {
      name: 'Should_StaySilent_When_DrawIsConsumedByRefusalCheck',
      code: `import { it } from '@effect/vitest'
${GUARD}
it.prop('∀b_BadHex_⊥', [arbitrary], ([value]) => !accepts(schema, value))
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_DrawIsConsumedByDiscriminates',
      code: `import { it } from '@effect/vitest'
${GUARD}
it.prop('∀g_BadHex_discriminates', [arbitrary], ([value]) => discriminates(schema, obligations, value))
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_PartiallyConsumedDrawListReadsSecondDraw',
      code: `import { it } from '@effect/vitest'
${GUARD}
it.prop('p', [genA, genB], ([_a, b]) => b !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_DrawIsConsumedThroughAMember',
      code: `import { it } from '@effect/vitest'
${GUARD}
it.prop('p', [gen], ([draw]) => draw.length > 0)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_EffectPropConsumesItsDraw',
      code: `import { it } from '@effect/vitest'
${GUARD}
it.effect.prop('p', [gen], ([x]) => x !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_FraudLivesOutsideAGuard',
      code: `import { it } from '@effect/vitest'
it.prop('∀x_Weaken_=Witness', [gen], ([_draw]) => check())`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_TheIfIsNotAnInSourceGuard',
      code: `import { it } from '@effect/vitest'
if (someCondition) {
  it.prop('p', [gen], ([_draw]) => check())
}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_CalleeIsNotAPropertyTest',
      code: `import { it } from '@effect/vitest'
${GUARD}
it('plain test', () => { const x = 1; return x === 1 })
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_ConstantFromRidesAForeignNamespace',
      code: `import { it } from '@effect/vitest'
${GUARD}
it.prop('p', [Pool.constantFrom(1, 2, 3)], ([samples]) => samples.length > 0)
${GUARD_END}`,
      filename: FILENAME,
    },
  ],
  invalid: [
    ...NO_IGNORED_DRAW_INVALID,
  ],
})
