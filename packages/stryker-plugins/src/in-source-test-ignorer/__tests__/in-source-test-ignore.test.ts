import { describe, it } from '@effect/vitest'
import { expect } from 'vitest'
import { decideInSourceTestIgnore, IN_SOURCE_TEST_IGNORED, isInSourceTestGuard } from '../in-source-test-ignore.js'
import { binaryOf, guardOf, identifier, importMetaMember, metaOf } from './ast-node.fixtures.js'

describe('isInSourceTestGuard', () => {
  it('Should_Match_When_TestIsBareImportMetaVitest', () => {
    expect(isInSourceTestGuard(guardOf(importMetaMember('vitest')))).toBe(true)
  })

  it('Should_Match_When_ImportMetaVitestIsBinaryLeft', () => {
    expect(isInSourceTestGuard(guardOf(binaryOf(importMetaMember('vitest'), identifier('undefined')))))
      .toBe(true)
  })

  it('Should_Match_When_ImportMetaVitestIsBinaryRight', () => {
    expect(isInSourceTestGuard(guardOf(binaryOf(identifier('undefined'), importMetaMember('vitest')))))
      .toBe(true)
  })

  it('Should_NotMatch_When_MetaPropertyIsNotVitest', () => {
    expect(isInSourceTestGuard(guardOf(importMetaMember('env')))).toBe(false)
  })

  it('Should_NotMatch_When_MetaIsNotImport', () => {
    const notImport = {
      type: 'MemberExpression',
      object: metaOf('require', 'meta'),
      property: identifier('vitest'),
    }
    expect(isInSourceTestGuard(guardOf(notImport))).toBe(false)
  })

  it('Should_NotMatch_When_MetaPropertyIsNotMeta', () => {
    const notMeta = {
      type: 'MemberExpression',
      object: metaOf('import', 'cache'),
      property: identifier('vitest'),
    }
    expect(isInSourceTestGuard(guardOf(notMeta))).toBe(false)
  })

  it('Should_NotMatch_When_NodeIsNotAnIfStatement', () => {
    expect(isInSourceTestGuard(importMetaMember('vitest'))).toBe(false)
  })

  it('Should_NotMatch_When_BinaryHoldsNoImportMetaVitest', () => {
    expect(isInSourceTestGuard(guardOf(binaryOf(identifier('a'), identifier('b'))))).toBe(false)
  })
})

describe('decideInSourceTestIgnore', () => {
  it('Should_Ignore_When_AnAncestorIsTheGuard', () => {
    const ancestors = [identifier('x'), binaryOf(identifier('a'), identifier('b')), guardOf(importMetaMember('vitest'))]
    expect(decideInSourceTestIgnore(ancestors)).toBe(IN_SOURCE_TEST_IGNORED)
  })

  it('Should_NotIgnore_When_NoAncestorIsTheGuard', () => {
    expect(decideInSourceTestIgnore([identifier('x'), guardOf(importMetaMember('env'))])).toBeUndefined()
  })

  it('Should_NotIgnore_When_ThereAreNoAncestors', () => {
    expect(decideInSourceTestIgnore([])).toBeUndefined()
  })
})
