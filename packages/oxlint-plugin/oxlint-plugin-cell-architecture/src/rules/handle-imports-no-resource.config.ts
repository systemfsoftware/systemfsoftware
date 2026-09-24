export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXPECTED =
  'a *.handle.ts module that imports no *.resource module — a handle is acquired by its own definition or through a parent’s child entry, never from a resource' as const

export const staticActualOf = (specifier: string): string =>
  `a static import of the *.resource module ${specifier}` as const
export const reexportActualOf = (specifier: string): string =>
  `a re-export of the *.resource module ${specifier}` as const
export const dynamicActualOf = (specifier: string): string =>
  `a dynamic import() of the *.resource module ${specifier}` as const

export const FIX =
  'import the resource’s kind value from the module that owns the pairing, or declare the pairing in a *.resource.ts module; a handle file never reaches into a resource' as const

export const meta = {
  type: 'problem',
  docs: {
    description: 'A *.handle.ts file never imports, re-exports, or dynamically imports a *.resource module (R23).',
  },
  schema: [],
  messages: {
    resourceImport: MESSAGE,
  },
} as const
