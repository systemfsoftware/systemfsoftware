import { Atom } from '@systemfsoftware/effect-atom'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import { describe, expect, it } from 'tstyche'

const count = Atom.make(0)
const readOnly = Atom.readable((get) => get(count) * 2)

describe('useAtomValue with a selector', () => {
  it('Should_ReturnTheSelectorOutputType_When_UseAtomValueIsGivenASelector', () => {
    expect(
      AtomReact.useAtomValue(count, (n) => {
        expect(n).type.toBe<number>()
        return `${n}`
      }),
    ).type.toBe<string>()
  })

  it('Should_AcceptTheSelectorInDataLastComposition_When_UseAtomValueIsPiped', () => {
    expect(AtomReact.useAtomValue((n: number) => n > 0)).type.toBeCallableWith(count)
    expect(AtomReact.useAtomValue(count, (n) => n > 0)).type.toBe<boolean>()
  })
})

describe('useAtomSet', () => {
  it('Should_AcceptAWritableAtom_When_UseAtomSetIsGivenAnAtom', () => {
    expect(AtomReact.useAtomSet).type.toBeCallableWith(count)
  })

  it('Should_RejectAReadOnlyDerivedAtom_When_UseAtomSetIsGivenOne', () => {
    expect(AtomReact.useAtomSet).type.not.toBeCallableWith(readOnly)
  })
})
