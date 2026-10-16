import { FAMILY_REACT_SOURCES, REACT_BINDING_FIX } from './atoms-read-services.config.js'

const importFixOf = (source: string, tail: string): string =>
  FAMILY_REACT_SOURCES[source] === true
    ? REACT_BINDING_FIX
    : `import { createFSM } from '${source}'${tail}`

/**
 * The closed key grammar, read at the fork pin `systemfsoftware/xstate@c8c376cc2`:
 * machine keys `id`/`initial`/`context`/`states` from `FSMConfig`
 * (`packages/xstate/src/fsm.ts:80-88`), state key `on` from `FSMStateConfig`
 * (`:66-73`), object transition keys `target`/`context` from `FSMTransitionConfig` (`:17-23`).
 */
export const MACHINE_CONFIG_KEYS: Readonly<Record<string, true>> = {
  id: true,
  initial: true,
  context: true,
  states: true,
}
export const STATE_CONFIG_KEYS: Readonly<Record<string, true>> = { on: true }
export const TRANSITION_CONFIG_KEYS: Readonly<Record<string, true>> = { target: true, context: true }

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

/** `unresolvableConfig`: a config the rule cannot read, and what it observed instead. */
export const UNRESOLVABLE_NAME = 'a shell machine config this rule cannot read statically' as const
export const UNRESOLVABLE_EXPECTED =
  'a createFSM config written as one object literal — or a spread of a module `const` object literal — in the adapter module beside its *.service.ts' as const
export const UNRESOLVABLE_FIX =
  "createFSM({ states: { closed: { on: { OPEN: 'open' } }, open: { on: { OPEN: 'open' } } } })" as const
export const unresolvableActual = (observed: string): string => `${observed} in a createFSM config`

/** `unclosedTransition`: a transition outside the fixed-target/event-copy form. */
export const UNCLOSED_NAME = 'a transition outside the closed event-to-target table' as const
export const UNCLOSED_EXPECTED =
  'a transition that names one fixed target, or copies event fields into context' as const
export const UNCLOSED_FIX = "({ event }) => ({ target: 'open', context: { id: event.id } })" as const
export const unclosedActual = (observed: string): string => `${observed} in a createFSM transition`

/** `disallowedConfigKey`: a key outside the closed config table. */
export const DISALLOWED_KEY_EXPECTED =
  'a createFSM config whose machine keys are id, initial, context and states, whose state keys are on, and whose object transitions carry target and context' as const
export const DISALLOWED_KEY_FIX =
  "keep each level to its keys: { initial: 'closed', states: { closed: { on: { OPEN: { target: 'open' } } } } }" as const
export const disallowedKeyName = (key: string): string => `the config key \`${key}\``
export const disallowedKeyActual = (key: string): string => `a \`${key}\` key in the config`

/** `missingEventType`: a state that names no event another state handles. */
export const MISSING_EVENT_EXPECTED = 'every state of the machine to name every event type some state handles' as const
export const missingEventName = (state: string, event: string): string => `state \`${state}\` missing \`${event}\``
export const missingEventActual = (state: string, event: string): string =>
  `a state table that names no \`${event}\` while another state handles it`
export const missingEventFix = (state: string, event: string): string =>
  `{ ${state}: { on: { ${event}: '<target>' } } }`

/** `rootMachineFactory`: a factory that builds a machine which can decide. */
export const ROOT_NAME = 'a root machine factory' as const
export const ROOT_EXPECTED = 'a createFSM table in the adapter module beside its *.service.ts' as const
export const ROOT_FIX = "createFSM({ states: { closed: { on: { OPEN: 'open' } } } })" as const
export const rootActual = (calleePath: string): string =>
  `\`${calleePath}(...)\` building a machine with guards, eventless and delayed transitions, invocations and actions`

/** `familyDynamicImport`: the family reached through `import()`. */
export const DYNAMIC_NAME = 'a dynamic import of the state-machine family' as const
export const DYNAMIC_EXPECTED = 'the machine factory imported statically in the file that calls it' as const
export const dynamicImportActual = (source: string): string => `\`import('${source}')\``
export const DYNAMIC_FIX = (source: string): string => importFixOf(source, '')

/** `familyReExport`: the family reached through a re-export. */
export const REEXPORT_NAME = 'a re-export of the state-machine family' as const
export const REEXPORT_EXPECTED = 'the machine factory imported statically where the machine is built' as const
export const reExportActual = (source: string): string => `a re-export of '${source}'`
export const REEXPORT_FIX = (source: string): string =>
  importFixOf(source, ' in the adapter module beside its *.service.ts')

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A shell state machine decides nothing: a createFSM config is one closed event-to-target table (every state names every event type some state handles; a transition is a fixed target or an event copy), and a root createMachine, a dynamic import of the state-machine family, a re-export of it and an exported family factory value are refused. The machine stays in the adapter module beside its *.service.ts, a decision belongs in a decide body with Match, and a decision result reaches the machine as an event whose type is the result `_tag`.',
  },
  schema: [],
  messages: {
    unresolvableConfig: MESSAGE,
    unclosedTransition: MESSAGE,
    disallowedConfigKey: MESSAGE,
    missingEventType: MESSAGE,
    rootMachineFactory: MESSAGE,
    familyDynamicImport: MESSAGE,
    familyReExport: MESSAGE,
  },
} as const
