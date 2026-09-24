import { Atom } from '@systemfsoftware/effect-atom'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import { describe, expect, it } from 'tstyche'

const count = Atom.make(0)
const readOnly = Atom.readable((get) => get(count) * 2)

describe('useAtomValue with a selector', () => {
  it('returns the selector output type', () => {
    expect(
      AtomReact.useAtomValue(count, (n) => {
        expect(n).type.toBe<number>()
        return `${n}`
      }),
    ).type.toBe<string>()
  })

  it('accepts the selector in data-last composition', () => {
    expect(AtomReact.useAtomValue((n: number) => n > 0)).type.toBeCallableWith(count)
    expect(AtomReact.useAtomValue(count, (n) => n > 0)).type.toBe<boolean>()
  })
})

describe('useAtomSet', () => {
  it('accepts a writable atom', () => {
    expect(AtomReact.useAtomSet).type.toBeCallableWith(count)
  })

  it('rejects a read-only derived atom', () => {
    expect(AtomReact.useAtomSet).type.not.toBeCallableWith(readOnly)
  })
})
