export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const DEFINITION_EXPECTED =
  'every operation, stream, child creator, release step, and integration written inline in the Handle.make call, so the rule can walk the body' as const
export const DEFINITION_ACTUAL_OF = (role: string): string => `the ${role} given by reference` as const
export const DEFINITION_FIX =
  'write the function inline in the Handle.make call; a one-file syntax rule cannot walk a body it does not see' as const

export const PARAMETER_EXPECTED =
  'the driver as a plain identifier in the first parameter position, the handle second' as const
export const PARAMETER_ACTUAL = 'a destructured or missing driver parameter' as const
export const PARAMETER_FIX =
  'declare the driver as the first plain identifier parameter — (driver, self, ...args) — and never destructure it' as const

export const EFFECT_PACKAGE_SOURCE = 'effect'

export const isEffectPackageSource = (source: string): boolean =>
  source === EFFECT_PACKAGE_SOURCE || source.startsWith(`${EFFECT_PACKAGE_SOURCE}/`)

export const REF_SINK_MEMBERS: Readonly<Record<string, true>> = {
  get: true,
  set: true,
  update: true,
  modify: true,
  getAndSet: true,
  getAndUpdate: true,
  updateAndGet: true,
  updateSome: true,
  modifySome: true,
  updateSomeAndGet: true,
  getAndUpdateSome: true,
}

export const DRIVER_EXPECTED =
  'the driver read only as the head of a member chain ending in a call other than bind; as a call argument (bare or as a member chain) inside the integration; through a function written inline as an argument of an effect-package call (directly, or inside an object-literal argument); or as the first argument of an effect Ref function (Ref.get, Ref.set, Ref.update, Ref.modify, …)' as const
export const DRIVER_ACTUAL_OF = (source: string): string =>
  `a driver read as ${source} outside those positions` as const
export const DRIVER_FIX =
  'confine the driver to its own methods (driver.work(...)); hand caller code a value built from those calls, never the driver itself, and give a third-party library the driver only inside integration' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Inside a Handle.make call the driver parameter stays confined to its own methods and the integration (R11, R12).',
  },
  schema: [],
  messages: {
    definitionByReference: MESSAGE,
    driverNotAnIdentifier: MESSAGE,
    driverEscapes: MESSAGE,
  },
} as const
