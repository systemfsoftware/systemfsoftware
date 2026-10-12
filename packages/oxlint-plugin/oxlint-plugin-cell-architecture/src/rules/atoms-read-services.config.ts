export const ATOM_SOURCES: Readonly<Record<string, true>> = {
  '@systemfsoftware/effect-atom': true,
  '@systemfsoftware/effect-atom-react': true,
}

export const FAMILY_REACT_SOURCES: Readonly<Record<string, true>> = {
  '@xstate/react': true,
  '@systemfsoftware/xstate-react': true,
  '@systemfsoftware/xstate-store-react': true,
}

export const meta = {
  type: 'problem',
  docs: {
    description:
      'An atom module — one that imports and references @systemfsoftware/effect-atom or @systemfsoftware/effect-atom-react — never imports the state-machine family, and no module imports the family React bindings (@xstate/react, @systemfsoftware/xstate-react, @systemfsoftware/xstate-store-react). Atoms read service functions: the service exposes plain values over its Layer and nothing outside the adapter module beside its *.service.ts subscribes to an actor.',
  },
  schema: [],
  messages: {
    atomImportsMachineFamily:
      'An atom module imports the state-machine family (`{{source}}`), which is refused. Atoms read service functions: expose a plain value, or a stream of them, from the service module over its Layer and read it through an atom runtime. The machine stays in the adapter module beside its *.service.ts, and nothing outside it subscribes to an actor.',
    machineFamilyReactBinding:
      'The state-machine family React binding `{{source}}` is refused. Nothing outside the service adapter module subscribes to an actor: expose a service function returning plain values and read it through an atom runtime — atoms read service functions.',
  },
} as const
