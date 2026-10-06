import { Schema } from 'effect'
import { describe, expect, it } from 'tstyche'
import { flagsOf } from '../src/surfaces/cli/mod.js'

describe('The flags a CLI derives from a contract input struct', () => {
  it('Should_DeriveAFlagPerField_When_NoFieldNameIsReserved', () => {
    expect(flagsOf).type.toBeCallableWith(
      Schema.Struct({ account: Schema.String, cents: Schema.Int }).fields,
    )
  })

  it('Should_RefuseAFieldNamedJson_When_ItCollidesWithTheOutputFlag', () => {
    expect(flagsOf).type.not.toBeCallableWith(Schema.Struct({ json: Schema.String }).fields)
  })

  it('Should_RefuseAFieldNamedTarget_When_ItCollidesWithTheTransportFlag', () => {
    expect(flagsOf).type.not.toBeCallableWith(Schema.Struct({ target: Schema.String }).fields)
  })

  it('Should_RefuseAFieldNamedInput_When_ItCollidesWithTheWholeInputFlag', () => {
    expect(flagsOf).type.not.toBeCallableWith(Schema.Struct({ input: Schema.String }).fields)
  })
})
