import { describe, expect, it } from 'vitest'
import { isMetaVitest, isVitestGuard } from '../vitest-guard.js'

const buildNode = (type: string, rest: Record<string, unknown> = {}): unknown => ({ type, ...rest })

describe('isMetaVitest', () => {
  it('Should_ReturnTrue_When_ImportMetaVitestMemberAccess', () => {
    const node = buildNode('MemberExpression', {
      object: buildNode('MetaProperty'),
      property: buildNode('Identifier', { name: 'vitest' }),
    })
    expect(isMetaVitest(node as never)).toBe(true)
  })

  it('Should_ReturnFalse_When_ObjectNotMetaProperty', () => {
    const node = buildNode('MemberExpression', {
      object: buildNode('Identifier', { name: 'import' }),
      property: buildNode('Identifier', { name: 'vitest' }),
    })
    expect(isMetaVitest(node as never)).toBe(false)
  })

  it('Should_ReturnFalse_When_PropertyNotIdentifier', () => {
    const node = buildNode('MemberExpression', {
      object: buildNode('MetaProperty'),
      property: buildNode('Literal', { value: 'vitest' }),
    })
    expect(isMetaVitest(node as never)).toBe(false)
  })

  it('Should_ReturnFalse_When_PropertyNameIsUrl', () => {
    const node = buildNode('MemberExpression', {
      object: buildNode('MetaProperty'),
      property: buildNode('Identifier', { name: 'url' }),
    })
    expect(isMetaVitest(node as never)).toBe(false)
  })

  it('Should_ReturnFalse_When_NodeIsNotMemberExpression', () => {
    expect(isMetaVitest(buildNode('Identifier', { name: 'vitest' }) as never)).toBe(false)
  })
})

describe('isVitestGuard', () => {
  it('Should_ReturnTrue_When_BareMetaVitest', () => {
    const node = buildNode('MemberExpression', {
      object: buildNode('MetaProperty'),
      property: buildNode('Identifier', { name: 'vitest' }),
    })
    expect(isVitestGuard(node as never)).toBe(true)
  })

  it('Should_ReturnTrue_When_BinaryLeftIsMetaVitest', () => {
    const node = buildNode('BinaryExpression', {
      left: buildNode('MemberExpression', {
        object: buildNode('MetaProperty'),
        property: buildNode('Identifier', { name: 'vitest' }),
      }),
      right: buildNode('Identifier', { name: 'undefined' }),
    })
    expect(isVitestGuard(node as never)).toBe(true)
  })

  it('Should_ReturnTrue_When_BinaryRightIsMetaVitest', () => {
    const node = buildNode('BinaryExpression', {
      left: buildNode('Identifier', { name: 'undefined' }),
      right: buildNode('MemberExpression', {
        object: buildNode('MetaProperty'),
        property: buildNode('Identifier', { name: 'vitest' }),
      }),
    })
    expect(isVitestGuard(node as never)).toBe(true)
  })

  it('Should_ReturnFalse_When_BinaryWithNoVitestSide', () => {
    const node = buildNode('BinaryExpression', {
      left: buildNode('Identifier', { name: 'a' }),
      right: buildNode('Identifier', { name: 'b' }),
    })
    expect(isVitestGuard(node as never)).toBe(false)
  })

  it('Should_ReturnFalse_When_NotBinaryNorMetaVitest', () => {
    const node = buildNode('Identifier', { name: 'foo' })
    expect(isVitestGuard(node as never)).toBe(false)
  })
})
