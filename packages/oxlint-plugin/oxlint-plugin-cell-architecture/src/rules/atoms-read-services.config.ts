export const ATOM_SOURCES: Readonly<Record<string, true>> = {
  '@systemfsoftware/effect-atom': true,
  '@systemfsoftware/effect-atom-react': true,
}

export const FAMILY_REACT_SOURCES: Readonly<Record<string, true>> = {
  '@xstate/react': true,
  '@systemfsoftware/xstate-react': true,
  '@systemfsoftware/xstate-store-react': true,
}

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

/** `atomImportsMachineFamily`: a family edge in a module that reads an atom. */
export const FAMILY_IMPORT_EXPECTED =
  'an atom module that reads a plain value or stream from a service function' as const
export const FAMILY_IMPORT_FIX =
  'expose the value from the service module over its Layer and read it through an atom: atom(() => Session.read())' as const
export const familyImportName = (source: string): string =>
  `the state-machine family import \`${source}\` in an atom module`
export const familyImportActual = (source: string): string => `\`import from '${source}'\``

/** `machineFamilyReactBinding`: an import of the family's React bindings. */
export const REACT_BINDING_EXPECTED =
  'no module, the adapter module included, to import the family React bindings; the machine stays behind its service, and atoms read service functions' as const
export const REACT_BINDING_FIX =
  'expose a service function returning plain values and read it through an atom: atom(() => Session.read())' as const
export const reactBindingName = (source: string): string => `the state-machine family React binding \`${source}\``
export const reactBindingActual = (source: string): string => `\`import from '${source}'\``

export const meta = {
  type: 'problem',
  docs: {
    description:
      'An atom module — one that imports and references @systemfsoftware/effect-atom or @systemfsoftware/effect-atom-react — never imports the state-machine family, and no module imports the family React bindings (@xstate/react, @systemfsoftware/xstate-react, @systemfsoftware/xstate-store-react). Atoms read service functions: the service exposes plain values over its Layer and nothing outside the adapter module beside its *.service.ts subscribes to an actor.',
  },
  schema: [],
  messages: {
    atomImportsMachineFamily: MESSAGE,
    machineFamilyReactBinding: MESSAGE,
  },
} as const
