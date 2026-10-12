export const PERMITTED_CONFIG_KEYS: Readonly<Record<string, true>> = {
  id: true,
  initial: true,
  context: true,
  states: true,
  on: true,
  target: true,
}

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A shell state machine decides nothing: a createFSM config is one closed event-to-target table (every state names every event type some state handles; a transition is a fixed target or an event copy), and a root createMachine, a dynamic import of the state-machine family and a re-export of it are refused. The machine stays in the adapter module beside its *.service.ts, a decision belongs in a decide body with Match, and a decision result reaches the machine as an event whose type is the result `_tag`.',
  },
  schema: [],
  messages: {
    unresolvableConfig:
      'A config this rule cannot read statically is refused. Write the createFSM config as one object literal, or spread a module `const` object literal; keep the machine in the adapter module beside its *.service.ts, decide in a decide body with `Match`, and let the decision result arrive as an event type.',
    unclosedTransition:
      'A transition outside the closed event-to-target table is refused. A transition names a fixed target or copies event fields into context — nothing else. A shell machine decides nothing: decide in a decide body with `Match` and let the decision result arrive as an event type.',
    disallowedConfigKey:
      'The config key `{{key}}` is refused. A createFSM config holds only id, initial, context, states, on and target, plus an event-copy transition function; anything else makes the shell machine decide. Decide in a decide body with `Match` and let the decision result arrive as an event type.',
    missingEventType:
      'State `{{state}}` does not name `{{event}}`, which another state of this machine handles, so the fork drops the event and no instrument sees it. Name `{{event}}` in every state of the table, or remove it from every state.',
    rootMachineFactory:
      'A root machine factory is refused: its config carries guards, eventless and delayed transitions, invocations and actions, so the machine decides there. Build the table with `createFSM` instead, keep the machine in the adapter module beside its *.service.ts, and let each decision result arrive as an event type from a decide body with `Match`.',
    familyDynamicImport:
      'A dynamic import of `{{source}}` is refused. A machine factory must be located by a static import in the file that calls it, so import `createFSM` statically and keep the machine in the adapter module beside its *.service.ts.',
    familyReExport:
      'A re-export of `{{source}}` is refused. A machine factory must be located by a static import in the file that calls it, so import `createFSM` where the machine is built, in the adapter module beside its *.service.ts.',
  },
} as const
