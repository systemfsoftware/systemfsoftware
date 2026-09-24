export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const RESOURCE_EXPECTED =
  'a *.resource.ts module that constructs its resource with Resource.make imported from @systemfsoftware/effect-cell-types' as const
export const RESOURCE_ACTUAL = 'a *.resource.ts module that constructs no resource' as const
export const RESOURCE_FIX =
  'call Resource.make({ spec, handle, prepare?, ready? }) in this module and export the resource it returns' as const

export const HANDLE_EXPECTED =
  'a *.handle.ts module that constructs its handle with Handle.make imported from @systemfsoftware/effect-cell-types' as const
export const HANDLE_ACTUAL = 'a *.handle.ts module that constructs no handle' as const
export const HANDLE_FIX =
  'call Handle.make({ name, create, release, operations, ... }) in this module and export the definition it returns' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.resource.ts file constructs a resource with Resource.make and a *.handle.ts file constructs a handle with Handle.make (R19).',
  },
  schema: [],
  messages: {
    missingConstruction: MESSAGE,
  },
} as const
