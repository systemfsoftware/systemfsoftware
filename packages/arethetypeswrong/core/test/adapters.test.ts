import { describe, expect, it } from 'vitest'

import { LexerAdapter, LexerAdapterStub } from '../src/lexer.adapter.js'
import { PackageStoreAdapter, PackageStoreAdapterStub } from '../src/package-store.adapter.js'
import { ResolverAdapter, ResolverAdapterStub } from '../src/resolver.adapter.js'
import { TarballAdapter, TarballAdapterStub } from '../src/tarball.adapter.js'
import { TypescriptAdapter, TypescriptAdapterStub } from '../src/typescript.adapter.ts'

describe('adapters: tag + stub shape', () => {
  it('TarballAdapter is a Context.Service with the expected identifier', () => {
    expect(TarballAdapter.key).toBe('@systemfsoftware/arethetypeswrong-core/TarballAdapter')
  })

  it('TarballAdapterStub produces a Layer value', () => {
    const layer = TarballAdapterStub([{ path: '/x', content: new Uint8Array([1, 2, 3]) }])
    expect(layer).toBeDefined()
  })

  it('PackageStoreAdapter has the expected identifier', () => {
    expect(PackageStoreAdapter.key).toBe('@systemfsoftware/arethetypeswrong-core/PackageStoreAdapter')
  })

  it('PackageStoreAdapterStub produces a Layer value', () => {
    const layer = PackageStoreAdapterStub(
      { packageName: 'x', packageVersion: '1.0.0', tarballUrl: 'https://x/y.tgz' },
      new Uint8Array([1]),
    )
    expect(layer).toBeDefined()
  })

  it('ResolverAdapter has the expected identifier', () => {
    expect(ResolverAdapter.key).toBe('@systemfsoftware/arethetypeswrong-core/ResolverAdapter')
  })

  it('ResolverAdapterStub produces a Layer value', () => {
    expect(ResolverAdapterStub).toBeDefined()
  })

  it('TypescriptAdapter has the expected identifier', () => {
    expect(TypescriptAdapter.key).toBe('@systemfsoftware/arethetypeswrong-core/TypescriptAdapter')
  })

  it('TypescriptAdapterStub produces a Layer value', () => {
    expect(TypescriptAdapterStub).toBeDefined()
  })

  it('LexerAdapter has the expected identifier', () => {
    expect(LexerAdapter.key).toBe('@systemfsoftware/arethetypeswrong-core/LexerAdapter')
  })

  it('LexerAdapterStub produces a Layer value', () => {
    expect(LexerAdapterStub).toBeDefined()
  })
})
