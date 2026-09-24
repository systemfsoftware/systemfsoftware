export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXPECTED =
  'a *.handle.ts whose Handle.make definition binding stays module-private, so the state in the kind slot is unnameable and unreachable from consumer code' as const

export const actualOf = (name: string, form: string): string => `the definition binding \`${name}\` ${form}` as const

export const DECLARATION_FORM = 'leaves the module with `export const`' as const
export const SPECIFIER_FORM = 'leaves the module with `export { ... }`' as const
export const DEFAULT_FORM = 'leaves the module with `export default`' as const

export const FIX =
  'drop the export — the module publishes TypeId, the is<Name> guard, its factory, and its dual operations, never the definition binding itself (handle-state-privacy.md: module-private symbol slots keep the driver unreachable)' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.handle.ts file keeps its Handle.make definition binding module-private; exporting it hands consumers the slot and the driver inside it.',
  },
  schema: [],
  messages: {
    exportedDefinition: MESSAGE,
  },
} as const
