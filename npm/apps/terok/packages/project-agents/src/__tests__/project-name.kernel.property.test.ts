import { describe, it } from '@effect/vitest'
import { FastCheck as fc } from 'effect'
import { isReservedName, isValidSlugName, slugifyName } from '../project-name.kernel.js'

const NAME_CONTRACT = /^[a-z0-9][a-z0-9_-]*$/

describe('project-name kernel — slug and reserved-name laws', () => {
  it.prop('∀s_SlugifyName_⊆Alphabet', [fc.string()], ([s]) => /^[a-z0-9_-]*$/.test(slugifyName(s)))

  it.prop('∀s_SlugifyName_=LowerCase', [fc.string()], ([s]) => slugifyName(s) === slugifyName(s).toLowerCase())

  it.prop('∀s_SlugifyName_=Idempotent', [fc.string()], ([s]) => slugifyName(slugifyName(s)) === slugifyName(s))

  it.prop('∀s_SlugifyName_⊥LeadingDash', [fc.string()], ([s]) => !/^[-_]/.test(slugifyName(s)))

  it.prop('∀s_SlugifyName_=NoDoubleDash', [fc.string()], ([s]) => !slugifyName(s).includes('--'))

  it.prop(
    '∀s_SpaceyInput_⊇SpaceToDash',
    [fc.string().filter((s) => s.includes(' '))],
    ([s]) => slugifyName(`a${s}b`).includes('-'),
  )

  it.prop('∀s_ValidSlugName_=Contract', [fc.string()], ([s]) => isValidSlugName(s) === NAME_CONTRACT.test(s))

  it.prop(
    '∀s_ReservedName_=Membership',
    [fc.string(), fc.array(fc.string(), { maxLength: 8 })],
    ([name, reserved]) => isReservedName(name, new Set(reserved)) === reserved.includes(name),
  )
})
