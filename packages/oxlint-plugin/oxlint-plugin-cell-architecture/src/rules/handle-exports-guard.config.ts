export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXPECTED = "an exported `is<Name>` guard bound to the handle definition's `is`" as const

export const MISSING_GUARD_ACTUAL = 'a *.handle.ts that exports no `is<Name>` guard' as const

export const UNBOUND_GUARD_ACTUAL_OF = (name: string): string =>
  `an exported \`${name}\` that is not bound to the definition's \`is\`` as const

export const FIX =
  "export the kind's own guard: `export const isRunningVM = RunningVMDef.is` — resource-vs-handle-duality.md §3 item 2: the public predicate is the definition's `is`, shared with `Handle.make`, not a hand-rolled predicate" as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      "A *.handle.ts file exports an is<Name> guard bound to its Handle.make definition's is, the same predicate the kind uses to recognize the record.",
  },
  schema: [],
  messages: {
    missingGuard: MESSAGE,
  },
} as const
