import { describe, expect, it } from 'tstyche'

import type { FailureCode, FailureError, FailureRecord } from '../src/verdict/failure.schema.js'
import type { StepRecord } from '../src/verdict/step-record.schema.js'

type ActStep = Extract<StepRecord, { readonly _tag: 'ActStep' }>

type AssertStep = Extract<StepRecord, { readonly _tag: 'AssertStep' }>

type WaitForStep = Extract<StepRecord, { readonly _tag: 'WaitForStep' }>

describe('FailureError', () => {
  it('has exactly one tag per failure code', () => {
    expect<FailureError['_tag']>().type.toBe<FailureCode>()
  })
})

describe('FailureRecord', () => {
  it('cannot be built without evidence', () => {
    expect<FailureRecord>().type.not.toBeAssignableFrom<{ code: 'ASSERTION_FAILED'; cause: 'product' }>()
  })

  it('cannot be built with empty evidence', () => {
    expect<FailureRecord>().type.not.toBeAssignableFrom<{ code: 'ASSERTION_FAILED'; cause: 'product'; evidence: [] }>()
  })
})

describe('StepRecord', () => {
  it('requires the cache record on an act step', () => {
    expect<ActStep>().type.not.toBeAssignableFrom<Omit<ActStep, 'cache'>>()
  })

  it('requires the check record on an assert step', () => {
    expect<AssertStep>().type.not.toBeAssignableFrom<Omit<AssertStep, 'record'>>()
  })

  it('requires the check record on a waitFor step', () => {
    expect<WaitForStep>().type.not.toBeAssignableFrom<Omit<WaitForStep, 'record'>>()
  })
})
