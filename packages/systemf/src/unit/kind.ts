export const UNIT_KIND_NAMES = ['cell', 'blueprint', 'handle', 'medium'] as const

/** The four kinds a production unit can have, in enrollment order. */
export type UnitKindName = (typeof UNIT_KIND_NAMES)[number]

export interface UnitKind {
  readonly packageName: string
  readonly exportPath: readonly string[]
}

/**
 * The exported declarations that make a value a unit, grouped by the kind it
 * enrolls as. A kind is found by package and export name through the checker,
 * never by a `src` path, so enrollment works in a consumer repository where
 * these packages resolve to published declaration files.
 */
export const UNIT_KINDS: Readonly<Record<UnitKindName, readonly UnitKind[]>> = {
  cell: [{ packageName: '@systemfsoftware/effect-cell-types', exportPath: ['Cell', 'Cell'] }],
  blueprint: [
    { packageName: '@systemfsoftware/effect-cell-types', exportPath: ['Blueprint', 'Blueprint'] },
    { packageName: '@systemfsoftware/effect-cell-types', exportPath: ['Blueprint', 'Definition'] },
  ],
  handle: [
    { packageName: '@systemfsoftware/effect-cell-types', exportPath: ['Handle', 'Handle'] },
    { packageName: '@systemfsoftware/effect-cell-types', exportPath: ['Handle', 'Definition'] },
  ],
  medium: [
    { packageName: '@systemfsoftware/effect-daemon-spec', exportPath: ['Supervisor', 'Medium', 'Medium'] },
    { packageName: '@systemfsoftware/effect-daemon-spec', exportPath: ['Supervisor', 'Medium', 'MediumPortShape'] },
  ],
}

export const UNIT_KIND_LIST: readonly UnitKind[] = UNIT_KIND_NAMES.flatMap((name) => UNIT_KINDS[name])

export const CONFORMANCE_PACKAGE = '@systemfsoftware/conformance-spec'

export const CONFORMANCE_EXPORT_PATH: readonly string[] = ['Conformance', 'stopped']

export const CONFORMANCE_NAMESPACE_PATH: readonly string[] = ['Conformance']

export const CONFORMANCE_TEST_FILENAME = /\.conformance\.test\.ts$/u
