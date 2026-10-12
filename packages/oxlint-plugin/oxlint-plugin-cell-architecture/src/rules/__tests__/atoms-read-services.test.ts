import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

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
      errors: [
        { messageId: 'atomImportsMachineFamily', data: { source: '@systemfsoftware/xstate/fsm' } },
      ],
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
      errors: [{ messageId: 'atomImportsMachineFamily', data: { source: '@systemfsoftware/xstate' } }],
    },
    {
      name: 'Should_Refuse_When_AnAtomModuleReExportsTheFamily',
      filename: SRC,
      code: `
import { atom } from '@systemfsoftware/effect-atom'

export const countAtom = atom(() => 0)
export { createFSM } from '@systemfsoftware/xstate/fsm'
`,
      errors: [
        { messageId: 'atomImportsMachineFamily', data: { source: '@systemfsoftware/xstate/fsm' } },
      ],
    },
    {
      name: 'Should_Refuse_When_AnAtomModuleImportsTheEffectFork',
      filename: SRC,
      code: `
import { atom } from '@systemfsoftware/effect-atom'
import { Machine } from '@systemfsoftware/xstate-effect'

export const machineAtom = atom(() => Machine.of('session'))
`,
      errors: [
        { messageId: 'atomImportsMachineFamily', data: { source: '@systemfsoftware/xstate-effect' } },
      ],
    },
    {
      name: 'Should_Refuse_When_AnAtomReactModuleImportsTheFamily',
      filename: SRC,
      code: `
import { useAtomValue } from '@systemfsoftware/effect-atom-react'
import { createFSM } from '@systemfsoftware/xstate/fsm'

export const useMachine = () => useAtomValue(machineAtom)
`,
      errors: [
        { messageId: 'atomImportsMachineFamily', data: { source: '@systemfsoftware/xstate/fsm' } },
      ],
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
      errors: [
        { messageId: 'atomImportsMachineFamily', data: { source: '@systemfsoftware/xstate/fsm' } },
      ],
    },
    {
      name: 'Should_Refuse_When_AModuleImportsTheFamilyReactBinding',
      filename: SRC,
      code: `
import { useMachine } from '@xstate/react'

export const hook = useMachine
`,
      errors: [{ messageId: 'machineFamilyReactBinding', data: { source: '@xstate/react' } }],
    },
    {
      name: 'Should_Refuse_When_AModuleImportsTheForkReactBinding',
      filename: SRC,
      code: `
import { useActorRef } from '@systemfsoftware/xstate-react'

export const hook = useActorRef
`,
      errors: [
        { messageId: 'machineFamilyReactBinding', data: { source: '@systemfsoftware/xstate-react' } },
      ],
    },
    {
      name: 'Should_Refuse_When_AModuleImportsTheStoreReactBinding',
      filename: SRC,
      code: `
import { useSelector } from '@systemfsoftware/xstate-store-react'

export const hook = useSelector
`,
      errors: [
        {
          messageId: 'machineFamilyReactBinding',
          data: { source: '@systemfsoftware/xstate-store-react' },
        },
      ],
    },
  ],
})
