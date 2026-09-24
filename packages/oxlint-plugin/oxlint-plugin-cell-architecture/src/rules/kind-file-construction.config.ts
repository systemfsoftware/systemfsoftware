export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const RETIRED_MESSAGE = '{{name}} carries a retired kind suffix. Fix: {{fix}}.' as const

export const BLUEPRINT_EXPECTED =
  'a *.blueprint.ts module that mints its blueprint with Blueprint.make imported from @systemfsoftware/effect-cell-types' as const
export const BLUEPRINT_ACTUAL = 'a *.blueprint.ts module that calls no Blueprint.make from the kinds package' as const
export const BLUEPRINT_FIX =
  'construct the blueprint with Blueprint.make<Spec>()(TypeId).steps({ steps, targets }) or .operations<Ops>()({ operations, targets }) in this module — staged-lawful-builders.md §1 makes the identity entrypoint mandatory; a same-spelled make imported from another module does not satisfy the kind' as const

export const RETIRED_FIX =
  "rename this file to *.blueprint.ts and mint the value with Blueprint.make imported from @systemfsoftware/effect-cell-types — a blueprint is a cold description, never Effect's Resource" as const

export const HANDLE_EXPECTED =
  'a *.handle.ts module that mints its handle with Handle.make imported from @systemfsoftware/effect-cell-types' as const
export const HANDLE_ACTUAL = 'a *.handle.ts module that calls no Handle.make from the kinds package' as const
export const HANDLE_FIX =
  'construct the handle with Handle.make<Data, Slot>()(TypeId) in this module — resource-vs-handle-duality.md §3 makes the kind mint the record; a same-spelled make imported from another module does not satisfy the kind' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.blueprint.ts file mints its blueprint with Blueprint.make and a *.handle.ts file mints its handle with Handle.make, both imported from @systemfsoftware/effect-cell-types; a *.resource.ts file reports the retired suffix.',
  },
  schema: [],
  messages: {
    missingConstruction: MESSAGE,
    retiredResourceFile: RETIRED_MESSAGE,
  },
} as const
