export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXPECTED =
  'a resource or handle module that declares no Context.Service — the kinds assemble services from their operations through `services` and hand a library its driver through `integration`' as const

export const actualOf = (className: string): string => `a Context.Service class (${className})` as const

export const FIX =
  'move the service into its own *.service.ts module and import it here; the kind builds its services through `services: (handle, members) => Context` and `integration: (driver, handle) => Layer`' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Resource and handle files declare no Context.Service (R21); a service beside a kind is a service the kind cannot see.',
  },
  schema: [],
  messages: {
    serviceDeclaration: MESSAGE,
  },
} as const
