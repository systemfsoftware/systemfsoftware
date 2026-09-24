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

const FILENAME = 'src/__tests__/example.property.test.ts'

const EXPECTED_DATA = { name: VIOLATION_NAME, expected: EXPECTED, actual: ACTUAL, fix: FIX }

const oneReport = [{ messageId: 'nestedQuantification', data: EXPECTED_DATA }]

const DISCHARGED_BY = `
import { it } from '@systemfsoftware/vitest'
import { costly } from '../kernel.js'

it.prop('p', { of: [gen], subject: (record) => record, runs: 100 }, (s, [record]) => {
  // nested loop
  for (const key in record) {
    if (!costly(key)) return false
  }
  return true
})
`

ruleTester.run('no-nested-quantification', noNestedQuantification, {
  valid: [
    {
      name: 'Should_StaySilent_When_GeneratorIsAConstantPool',
      filename: FILENAME,
      code: `
import { it } from '@systemfsoftware/vitest'
import { Schema } from 'effect'

it.prop('p', { of: [Schema.Array(Schema.Number)], subject: (pool) => pool, runs: 100 }, (s, [pool]) => {
  return pool.length > 0
})
`,
    },
    {
      name: 'Should_StaySilent_When_OnlyTheBoundedParameterDrivesTheLoop',
      filename: FILENAME,
      code: `
import { it } from '@systemfsoftware/vitest'
import { costly } from '../kernel.js'

it.prop('p', { of: [fc.constant([1, 2, 3]), gen], subject: (pool) => pool, runs: 100 }, (s, [pool, drawn]) => {
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
import { it } from '@systemfsoftware/vitest'
import { costly } from '../kernel.js'

const ALPHABET = ['a', 'b', 'c']

it.prop('p', { of: [gen], subject: (drawn) => drawn, runs: 100 }, (s, [drawn]) => {
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
import { it } from '@systemfsoftware/vitest'

it.prop('p', { of: [gen], subject: (samples) => samples, runs: 100 }, (s, [samples]) => samples.reduce((deepest, sample) => deepest + sample, 0) === 0)
`,
    },
    {
      name: 'Should_StaySilent_When_MethodIsNotAnIterator',
      filename: FILENAME,
      code: `
import { it } from '@systemfsoftware/vitest'
import { costly } from '../kernel.js'

it.prop('p', { of: [gen], subject: (samples) => samples, runs: 100 }, (s, [samples]) => samples.pipe((sample) => costly(sample)) !== null)
`,
    },
    {
      name: 'Should_StaySilent_When_IteratorNameIsALiteralKey',
      filename: FILENAME,
      code: `
import { it } from '@systemfsoftware/vitest'
import { costly } from '../kernel.js'

it.prop('p', { of: [gen], subject: (samples) => samples, runs: 100 }, (s, [samples]) => samples['every']((sample) => costly(sample)))
`,
    },
    {
      name: 'Should_StaySilent_When_CalleeIsNotAMember',
      filename: FILENAME,
      code: `
import { it } from '@systemfsoftware/vitest'
import { costly, runAll } from '../kernel.js'

it.prop('p', { of: [gen], subject: (samples) => samples, runs: 100 }, (s, [samples]) => runAll((sample) => costly(sample)) !== samples)
`,
    },
    {
      name: 'Should_StaySilent_When_IteratorHasNoCallback',
      filename: FILENAME,
      code: `
import { it } from '@systemfsoftware/vitest'

it.prop('p', { of: [gen], subject: (samples) => samples, runs: 100 }, (s, [samples]) => samples.map().length === 0)
`,
    },
    {
      name: 'Should_StaySilent_When_LoopCallsItsOwnParameter',
      filename: FILENAME,
      code: `
import { it } from '@systemfsoftware/vitest'

it.prop('p', { of: [gen], subject: (thunks) => thunks, runs: 100 }, (s, [thunks]) => thunks.every((thunk) => thunk()))
`,
    },
    {
      name: 'Should_StaySilent_When_LoopCallsALocalFunctionDeclaration',
      filename: FILENAME,
      code: `
import { it } from '@systemfsoftware/vitest'

it.prop('p', { of: [gen], subject: (samples) => samples, runs: 100 }, (s, [samples]) => {
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
import { it } from '@systemfsoftware/vitest'

it.prop('p', { of: [gen], subject: (samples) => samples, runs: 100 }, (s, [samples]) => {
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

test.prop('p', { of: [gen], subject: (samples) => samples, runs: 100 }, (s, [samples]) => {
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
import { it } from '@systemfsoftware/vitest'

it.prop('p', { of: [gen], subject: (samples) => samples, runs: 100 })
`,
    },
    {
      name: 'Should_StaySilent_When_FileIsExempt',
      filename: FILENAME,
      options: [{ exempt: ['example.property.test.ts'] }],
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
      options: [{ exempt: ['union-kernel.property.test.ts'] }],
      code: DISCHARGED_BY,
      errors: oneReport,
    },
    {
      name: 'Should_Report_When_PredicateIteratesGeneratedValue',
      filename: FILENAME,
      code: `
import { it } from '@systemfsoftware/vitest'
import { costly } from '../kernel.js'

it.prop('p', { of: [gen], subject: (samples) => samples, runs: 100 }, (s, [samples]) => {
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
import { it } from '@systemfsoftware/vitest'
import { Processor } from '../kernel.js'

it.prop('p', { of: [gen], subject: (samples) => samples, runs: 100 }, (s, [samples]) => {
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
import { it } from '@systemfsoftware/vitest'
import { costly } from '../kernel.js'
import { Pool } from '../pool.js'

it.prop('p', { of: [Pool.constantFrom(1, 2, 3)], subject: (samples) => samples, runs: 100 }, (s, [samples]) => {
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
import { it } from '@systemfsoftware/vitest'
import { costly } from '../kernel.js'
import { wrappers } from '../wrappers.js'

it.prop('p', { of: [wrappers.fc.constantFrom(1, 2, 3)], subject: (samples) => samples, runs: 100 }, (s, [samples]) => {
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
import { it } from '@systemfsoftware/vitest'
import { costly } from '../kernel.js'

it.prop('p', { of: [gen], subject: (record) => record, runs: 100 }, (s, [record]) => {
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
import { it } from '@systemfsoftware/vitest'
import { costly } from '../kernel.js'

it.prop('p', { of: [gen], subject: (samples) => samples, runs: 100 }, (s, [samples]) => {
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
import { it } from '@systemfsoftware/vitest'
import { costly } from '../kernel.js'

it.prop('p', { of: [gen], subject: (samples) => samples, runs: 100 }, (s, [samples]) => {
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
import { it } from '@systemfsoftware/vitest'
import { costly } from '../kernel.js'

it.prop('p', { of: [gen], subject: (samples) => samples, runs: 100 }, (s, [samples]) => {
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
import { it } from '@systemfsoftware/vitest'
import { costly } from '../kernel.js'

it.prop('p', { of: [gen], subject: (samples) => samples, runs: 100 }, (s, [samples]) => {
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
import { it } from '@systemfsoftware/vitest'
import { costly } from '../kernel.js'

it.effect.prop('p', { of: [gen], subject: (samples) => samples, runs: 100 }, (s, [samples]) => {
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
import { it } from '@systemfsoftware/vitest'
import { constant } from 'fast-check'
import { costly } from '../kernel.js'

it.prop('p', { of: [constant([1, 2, 3])], subject: (pool) => pool, runs: 100 }, (s, [pool]) => {
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
import { it } from '@systemfsoftware/vitest'
import { FastCheck as fc } from 'effect'
import { costly } from '../kernel.js'

it.prop('p', { of: [fc['constantFrom'](1, 2, 3)], subject: (pool) => pool, runs: 100 }, (s, [pool]) => {
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
import { it } from '@systemfsoftware/vitest'
import { costly } from '../kernel.js'

it.prop('p', { of: [gen], subject: (drawn) => drawn, runs: 100 }, (s, drawn) => {
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
import { it } from '@systemfsoftware/vitest'
import { costly } from '../kernel.js'

it.prop('p', { of: [, gen], subject: (held) => held, runs: 100 }, (s, [held, drawn]) => {
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
import { it } from '@systemfsoftware/vitest'
import { costly } from '../kernel.js'

it.prop('p', generators, (s, [samples]) => {
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
