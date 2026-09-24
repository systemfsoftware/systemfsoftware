export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const RESOURCE_EXPECTED =
  'a *.resource.ts module that mints its resource with Resource.make imported from @systemfsoftware/effect-cell-types' as const
export const RESOURCE_ACTUAL = 'a *.resource.ts module that calls no Resource.make from the kinds package' as const
export const RESOURCE_FIX =
  'construct the resource with Resource.make<Spec>()({ typeId, combinators, projections }) in this module — staged-lawful-builders.md §1 makes the identity entrypoint mandatory; a same-spelled make imported from another module does not satisfy the kind' as const

export const HANDLE_EXPECTED =
  'a *.handle.ts module that mints its handle with Handle.make imported from @systemfsoftware/effect-cell-types' as const
export const HANDLE_ACTUAL = 'a *.handle.ts module that calls no Handle.make from the kinds package' as const
export const HANDLE_FIX =
  'construct the handle with Handle.make<Data, Slot>()(TypeId) in this module — resource-vs-handle-duality.md §3 makes the kind mint the record; a same-spelled make imported from another module does not satisfy the kind' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.resource.ts file mints its resource with Resource.make and a *.handle.ts file mints its handle with Handle.make, both imported from @systemfsoftware/effect-cell-types.',
  },
  schema: [],
  messages: {
    missingConstruction: MESSAGE,
  },
} as const
