import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { ACTUAL, EXPECTED, FIX, VIOLATION_NAME } from '../no-nested-quantification.config.js'
import { noNestedQuantification } from '../no-nested-quantification.js'

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

const FILENAME = 'src/__tests__/refutation.kernel.property.test.ts'

const EXPECTED_DATA = { name: VIOLATION_NAME, expected: EXPECTED, actual: ACTUAL, fix: FIX }

const oneReport = [{ messageId: 'nestedQuantification', data: EXPECTED_DATA }]

const DISCHARGED_BY = `
import { it } from '@effect/vitest'
import { FastCheck as fc } from 'effect'
import { dischargedBy, obligationsOf } from '../refutation.kernel.js'
import { FixturePlainRecipe, makeRestrictiveSchema } from '../schema-recipe.observer.js'

it.prop('r_EachWitness', [FixturePlainRecipe], ([recipe]) => {
  const schema = makeRestrictiveSchema(recipe)
  const obligations = obligationsOf(schema)
  return [...obligations.entries()].every(([node, obligation]) => {
    const credits = dischargedBy(schema, obligations, { W: fc.constant(obligation.witness) })
    return (credits.get(node) ?? []).includes('W')
  })
})
`

ruleTester.run('no-nested-quantification', noNestedQuantification, {
  valid: [
    {
      name: 'Should_StaySilent_When_GeneratorIsAConstantPool',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { FastCheck as fc } from 'effect'
import { dischargedBy, obligationsOf } from '../refutation.kernel.js'

const REFUTABLE_SCHEMAS = [Hexish, Slug, Port] as const

it.prop('r_EachWitness', [fc.constantFrom(...REFUTABLE_SCHEMAS)], ([schema]) => {
  const obligations = obligationsOf(schema)
  return [...obligations.entries()].every(([node, obligation]) => {
    const credits = dischargedBy(schema, obligations, { W: fc.constant(obligation.witness) })
    return (credits.get(node) ?? []).includes('W')
  })
})
`,
    },
    {
      name: 'Should_StaySilent_When_OnlyTheBoundedParameterDrivesTheLoop',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { FastCheck as fc } from 'effect'
import { costly } from '../kernel.js'

it.prop('p', [fc.constant([1, 2, 3]), gen], ([pool, drawn]) => {
  for (const entry of pool) {
    if (!costly(entry)) return false
  }
  return drawn !== null
})
`,
    },
    {
      name: 'Should_StaySilent_When_PredicateIteratesAConstant',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { costly } from '../kernel.js'

const ALPHABET = ['a', 'b', 'c']

it.prop('p', [gen], ([drawn]) => {
  for (const letter of ALPHABET) {
    if (costly(letter)) return false
  }
  return drawn !== null
})
`,
    },
    {
      name: 'Should_StaySilent_When_PredicateFoldsWithoutNestedCall',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'

it.prop('p', [gen], ([samples]) => samples.reduce((deepest, sample) => deepest + sample, 0) === 0)
`,
    },
    {
      name: 'Should_StaySilent_When_MethodIsNotAnIterator',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { costly } from '../kernel.js'

it.prop('p', [gen], ([samples]) => samples.pipe((sample) => costly(sample)) !== null)
`,
    },
    {
      name: 'Should_StaySilent_When_IteratorNameIsALiteralKey',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { costly } from '../kernel.js'

it.prop('p', [gen], ([samples]) => samples['every']((sample) => costly(sample)))
`,
    },
    {
      name: 'Should_StaySilent_When_CalleeIsNotAMember',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { costly, runAll } from '../kernel.js'

it.prop('p', [gen], ([samples]) => runAll((sample) => costly(sample)) !== samples)
`,
    },
    {
      name: 'Should_StaySilent_When_IteratorHasNoCallback',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'

it.prop('p', [gen], ([samples]) => samples.map().length === 0)
`,
    },
    {
      name: 'Should_StaySilent_When_LoopCallsItsOwnParameter',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'

it.prop('p', [gen], ([thunks]) => thunks.every((thunk) => thunk()))
`,
    },
    {
      name: 'Should_StaySilent_When_LoopCallsALocalFunctionDeclaration',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'

it.prop('p', [gen], ([samples]) => {
  function widen(sample) {
    return sample + 1
  }
  for (const sample of samples) {
    if (widen(sample) < 0) return false
  }
  return true
})
`,
    },
    {
      name: 'Should_StaySilent_When_LoopCallsALocalConstArrow',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'

it.prop('p', [gen], ([samples]) => {
  const widen = (sample) => sample + 1
  for (const sample of samples) {
    if (widen(sample) < 0) return false
  }
  return true
})
`,
    },
    {
      name: 'Should_StaySilent_When_CallIsNotAPropCall',
      filename: FILENAME,
      code: `
import { test } from 'vitest'
import { costly } from '../kernel.js'

test.prop('p', [gen], ([samples]) => {
  for (const sample of samples) {
    if (!costly(sample)) return false
  }
  return true
})
`,
    },
    {
      name: 'Should_StaySilent_When_PropCallHasNoPredicate',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'

it.prop('p', [gen])
`,
    },
    {
      name: 'Should_StaySilent_When_FileIsExempt',
      filename: FILENAME,
      options: [{ exempt: ['refutation.kernel.property.test.ts'] }],
      code: DISCHARGED_BY,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_NestedCallLoopsInternally',
      filename: FILENAME,
      code: DISCHARGED_BY,
      errors: oneReport,
    },
    {
      name: 'Should_Report_When_SuppressionListOmitsThisFile',
      filename: FILENAME,
      options: [{ exempt: ['bounded-union.kernel.property.test.ts'] }],
      code: DISCHARGED_BY,
      errors: oneReport,
    },
    {
      name: 'Should_Report_When_PredicateIteratesGeneratedValue',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { costly } from '../kernel.js'

it.prop('p', [gen], ([samples]) => {
  for (const sample of samples) {
    if (!costly(sample)) return false
  }
  return true
})
`,
      errors: oneReport,
    },
    {
      name: 'Should_Report_When_LoopConstructsPerDrawnElement',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { Processor } from '../kernel.js'

it.prop('p', [gen], ([samples]) => {
  for (const sample of samples) {
    new Processor(sample)
  }
  return true
})
`,
      errors: oneReport,
    },
    {
      name: 'Should_Report_When_ConstantPoolCallIsNotFastCheck',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { costly } from '../kernel.js'
import { Pool } from '../pool.js'

it.prop('p', [Pool.constantFrom(1, 2, 3)], ([samples]) => {
  for (const sample of samples) {
    if (!costly(sample)) return false
  }
  return true
})
`,
      errors: oneReport,
    },
    {
      name: 'Should_Report_When_ConstantPoolObjectIsNotAPlainIdentifier',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { costly } from '../kernel.js'
import { wrappers } from '../wrappers.js'

it.prop('p', [wrappers.fc.constantFrom(1, 2, 3)], ([samples]) => {
  for (const sample of samples) {
    if (!costly(sample)) return false
  }
  return true
})
`,
      errors: oneReport,
    },
    {
      name: 'Should_Report_When_LoopIsForIn',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { costly } from '../kernel.js'

it.prop('p', [gen], ([record]) => {
  for (const key in record) {
    if (!costly(key)) return false
  }
  return true
})
`,
      errors: oneReport,
    },
    {
      name: 'Should_Report_When_LoopIsACountingFor',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { costly } from '../kernel.js'

it.prop('p', [gen], ([samples]) => {
  for (let index = 0; index < samples.length; index++) {
    if (!costly(samples[index])) return false
  }
  return true
})
`,
      errors: oneReport,
    },
    {
      name: 'Should_Report_When_LoopIsAWhile',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { costly } from '../kernel.js'

it.prop('p', [gen], ([samples]) => {
  const queue = [...samples]
  while (queue.length > 0) {
    if (!costly(queue.pop())) return false
  }
  return true
})
`,
      errors: oneReport,
    },
    {
      name: 'Should_Report_When_LoopIsADoWhile',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { costly } from '../kernel.js'

it.prop('p', [gen], ([samples]) => {
  const queue = [...samples]
  do {
    if (!costly(queue.pop())) return false
  } while (queue.length > 0)
  return true
})
`,
      errors: oneReport,
    },
    {
      name: 'Should_Report_When_AccumulatorIsDeclaredWithoutInitializer',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { costly } from '../kernel.js'

it.prop('p', [gen], ([samples]) => {
  let last
  for (const sample of samples) {
    last = costly(sample)
  }
  return last !== undefined
})
`,
      errors: oneReport,
    },
    {
      name: 'Should_Report_When_PropCallIsEffectFlavoured',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { costly } from '../kernel.js'

it.effect.prop('p', [gen], ([samples]) => {
  for (const sample of samples) {
    if (!costly(sample)) return false
  }
  return true
})
`,
      errors: oneReport,
    },
    {
      name: 'Should_Report_When_PoolCalleeIsNotAMemberExpression',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { constant } from 'fast-check'
import { costly } from '../kernel.js'

it.prop('p', [constant([1, 2, 3])], ([pool]) => {
  for (const entry of pool) {
    if (!costly(entry)) return false
  }
  return true
})
`,
      errors: oneReport,
    },
    {
      name: 'Should_Report_When_PoolMethodIsAComputedKey',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { FastCheck as fc } from 'effect'
import { costly } from '../kernel.js'

it.prop('p', [fc['constantFrom'](1, 2, 3)], ([pool]) => {
  for (const entry of pool) {
    if (!costly(entry)) return false
  }
  return true
})
`,
      errors: oneReport,
    },
    {
      name: 'Should_Report_When_PredicateParamIsNotATuplePattern',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { costly } from '../kernel.js'

it.prop('p', [gen], (drawn) => {
  for (const sample of drawn) {
    if (!costly(sample)) return false
  }
  return true
})
`,
      errors: oneReport,
    },
    {
      name: 'Should_Report_When_GeneratorListHasAHole',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { costly } from '../kernel.js'

it.prop('p', [, gen], ([held, drawn]) => {
  for (const sample of held) {
    if (!costly(sample)) return false
  }
  return drawn !== null
})
`,
      errors: oneReport,
    },
    {
      name: 'Should_Report_When_GeneratorListIsNotAnArrayLiteral',
      filename: FILENAME,
      code: `
import { it } from '@effect/vitest'
import { costly } from '../kernel.js'

it.prop('p', generators, ([samples]) => {
  for (const sample of samples) {
    if (!costly(sample)) return false
  }
  return true
})
`,
      errors: oneReport,
    },
  ],
})
