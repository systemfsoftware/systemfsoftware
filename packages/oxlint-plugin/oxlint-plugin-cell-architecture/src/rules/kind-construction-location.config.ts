export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const RESOURCE_EXPECTED = 'Resource.make constructed only in a *.resource.ts module' as const
export const RESOURCE_FIX =
  'move this Resource.make construction into the resource module it belongs to and import the resource from here' as const

export const HANDLE_EXPECTED = 'Handle.make constructed only in a *.handle.ts module' as const
export const HANDLE_FIX =
  'move this Handle.make construction into the handle module it belongs to and import the definition from here' as const

export const resourceActualOf = (basename: string): string => `a Resource.make construction in ${basename}`

export const handleActualOf = (basename: string): string => `a Handle.make construction in ${basename}`

export const meta = {
  type: 'problem',
  docs: {
    description: 'Resource.make appears only in *.resource.ts files and Handle.make only in *.handle.ts files (R20).',
  },
  schema: [],
  messages: {
    misplacedConstruction: MESSAGE,
  },
} as const
