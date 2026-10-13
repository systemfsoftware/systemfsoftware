import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  FAMILY_IMPORT_EXPECTED,
  FAMILY_IMPORT_FIX,
  familyImportActual,
  familyImportName,
  REACT_BINDING_EXPECTED,
  REACT_BINDING_FIX,
  reactBindingActual,
  reactBindingName,
} from '../atoms-read-services.config.js'
import { atomsReadServices } from '../atoms-read-services.js'

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

const SRC = '/repo/packages/shop/src/session.atom.ts'

const familyImportError = (source: string) => ({
  messageId: 'atomImportsMachineFamily' as const,
  data: {
    name: familyImportName(source),
    expected: FAMILY_IMPORT_EXPECTED,
    actual: familyImportActual(source),
    fix: FAMILY_IMPORT_FIX,
  },
})

const reactBindingError = (source: string) => ({
  messageId: 'machineFamilyReactBinding' as const,
  data: {
    name: reactBindingName(source),
    expected: REACT_BINDING_EXPECTED,
    actual: reactBindingActual(source),
    fix: REACT_BINDING_FIX,
  },
})

ruleTester.run('atoms-read-services', atomsReadServices, {
  valid: [
    {
      name: 'Should_Pass_When_AnAtomReadsAServiceFunction',
      filename: SRC,
      code: `
import { atom } from '@systemfsoftware/effect-atom'
import { Session } from './session.service.js'

export const sessionAtom = atom(() => Session.read())
`,
    },
    {
      name: 'Should_Pass_When_AServiceModuleImportsTheForkWithoutAnAtom',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

export const sessionMachine = createFSM({ states: { closed: {} } })
`,
    },
    {
      // A type-only edge carries no machine: the family never reaches this module.
      name: 'Should_Pass_When_AWholeFamilyImportIsTypeOnly',
      filename: SRC,
      code: `
import { atom } from '@systemfsoftware/effect-atom'
import type { createFSM } from '@systemfsoftware/xstate/fsm'

export type MachineFactory = typeof createFSM
export const countAtom = atom(() => 0)
`,
    },
    {
      name: 'Should_Pass_When_EveryFamilySpecifierIsTypeOnly',
      filename: SRC,
      code: `
import { atom } from '@systemfsoftware/effect-atom'
import { type createFSM } from '@systemfsoftware/xstate/fsm'

export type MachineFactory = typeof createFSM
export const countAtom = atom(() => 0)
`,
    },
    {
      name: 'Should_Pass_When_TheFamilyReExportIsTypeOnly',
      filename: SRC,
      code: `
import { atom } from '@systemfsoftware/effect-atom'

export const countAtom = atom(() => 0)
export type { createFSM } from '@systemfsoftware/xstate/fsm'
`,
    },
    {
      name: 'Should_Pass_When_TheReactBindingImportIsTypeOnly',
      filename: SRC,
      code: `
import type { useMachine } from '@xstate/react'

export type MachineHook = typeof useMachine
`,
    },
    {
      name: 'Should_Pass_When_TheAtomImportIsTypeOnly',
      filename: SRC,
      code: `
import type { Atom } from '@systemfsoftware/effect-atom'
import { createFSM } from '@systemfsoftware/xstate/fsm'

export const machine: Atom<string> = createFSM({ states: { closed: {} } })
`,
    },
    {
      name: 'Should_Pass_When_TheAtomImportIsNeverReferenced',
      filename: SRC,
      code: `
import { atom } from '@systemfsoftware/effect-atom'
import { createFSM } from '@systemfsoftware/xstate/fsm'

export const machine = createFSM({ states: { closed: {} } })
`,
    },
    {
      // Only a reference that binds the atom import marks an atom module: a local
      // parameter that shadows the imported name is not that import.
      name: 'Should_Pass_When_OnlyAShadowingParameterReadsTheAtomName',
      filename: SRC,
      code: `
import { atom } from '@systemfsoftware/effect-atom'
import { createFSM } from '@systemfsoftware/xstate/fsm'

export const apply = (atom: (n: number) => number) => atom(1)
export const machine = createFSM({ states: { closed: {} } })
`,
    },
  ],
  invalid: [
    {
      name: 'Should_Refuse_When_AnAtomModuleImportsTheFamilyStatically',
      filename: SRC,
      code: `
import { atom } from '@systemfsoftware/effect-atom'
import { createFSM } from '@systemfsoftware/xstate/fsm'

export const machineAtom = atom(() => createFSM({ states: { closed: {} } }))
`,
      errors: [familyImportError('@systemfsoftware/xstate/fsm')],
    },
    {
      name: 'Should_Refuse_When_AnAtomModuleImportsTheFamilyDynamically',
      filename: SRC,
      code: `
import { atom } from '@systemfsoftware/effect-atom'

export const machineAtom = atom(async () => {
  const mod = await import('@systemfsoftware/xstate')
  return mod
})
`,
      errors: [familyImportError('@systemfsoftware/xstate')],
    },
    {
      name: 'Should_Refuse_When_AnAtomModuleImportsTheAtomPackageDynamically',
      filename: SRC,
      code: `
import { createFSM } from '@systemfsoftware/xstate/fsm'

export const loadMachine = async () => {
  const { atom } = await import('@systemfsoftware/effect-atom')
  return atom(() => createFSM({ states: { closed: {} } }))
}
`,
      errors: [familyImportError('@systemfsoftware/xstate/fsm')],
    },
    {
      name: 'Should_Refuse_When_AnAtomModuleReExportsTheFamily',
      filename: SRC,
      code: `
import { atom } from '@systemfsoftware/effect-atom'

export const countAtom = atom(() => 0)
export { createFSM } from '@systemfsoftware/xstate/fsm'
`,
      errors: [familyImportError('@systemfsoftware/xstate/fsm')],
    },
    {
      name: 'Should_Refuse_When_AnAtomModuleImportsTheFamilyBySideEffect',
      filename: SRC,
      code: `
import { atom } from '@systemfsoftware/effect-atom'
import '@systemfsoftware/xstate/fsm'

export const countAtom = atom(() => 0)
`,
      errors: [familyImportError('@systemfsoftware/xstate/fsm')],
    },
    {
      name: 'Should_Refuse_When_AnAtomModuleImportsTheEffectFork',
      filename: SRC,
      code: `
import { atom } from '@systemfsoftware/effect-atom'
import { Machine } from '@systemfsoftware/xstate-effect'

export const machineAtom = atom(() => Machine.of('session'))
`,
      errors: [familyImportError('@systemfsoftware/xstate-effect')],
    },
    {
      name: 'Should_Refuse_When_AnAtomReactModuleImportsTheFamily',
      filename: SRC,
      code: `
import { useAtomValue } from '@systemfsoftware/effect-atom-react'
import { createFSM } from '@systemfsoftware/xstate/fsm'

export const useMachine = () => useAtomValue(machineAtom)
`,
      errors: [familyImportError('@systemfsoftware/xstate/fsm')],
    },
    {
      name: 'Should_Refuse_When_AModuleOnlyReadsAnAtomItImports',
      filename: SRC,
      code: `
import { Atom } from '@systemfsoftware/effect-atom'
import { createFSM } from '@systemfsoftware/xstate/fsm'

export const registry = Atom.registry
export const machine = createFSM({ states: { closed: {} } })
`,
      errors: [familyImportError('@systemfsoftware/xstate/fsm')],
    },
    {
      name: 'Should_Refuse_When_AModuleImportsTheFamilyReactBinding',
      filename: SRC,
      code: `
import { useMachine } from '@xstate/react'

export const hook = useMachine
`,
      errors: [reactBindingError('@xstate/react')],
    },
    {
      name: 'Should_Refuse_When_AModuleImportsTheForkReactBinding',
      filename: SRC,
      code: `
import { useActorRef } from '@systemfsoftware/xstate-react'

export const hook = useActorRef
`,
      errors: [reactBindingError('@systemfsoftware/xstate-react')],
    },
    {
      name: 'Should_Refuse_When_AModuleImportsTheStoreReactBinding',
      filename: SRC,
      code: `
import { useSelector } from '@systemfsoftware/xstate-store-react'

export const hook = useSelector
`,
      errors: [reactBindingError('@systemfsoftware/xstate-store-react')],
    },
  ],
})
