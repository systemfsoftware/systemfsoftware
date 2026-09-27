export interface UnitKind {
  readonly packageName: string
  readonly exportPath: readonly string[]
}

export const UNIT_KINDS: readonly UnitKind[] = [
  { packageName: '@systemfsoftware/effect-cell-types', exportPath: ['Cell', 'Cell'] },
  { packageName: '@systemfsoftware/effect-cell-types', exportPath: ['Blueprint', 'Blueprint'] },
  { packageName: '@systemfsoftware/effect-cell-types', exportPath: ['Blueprint', 'Definition'] },
  { packageName: '@systemfsoftware/effect-cell-types', exportPath: ['Handle', 'Handle'] },
  { packageName: '@systemfsoftware/effect-cell-types', exportPath: ['Handle', 'Definition'] },
  { packageName: '@systemfsoftware/effect-daemon-spec', exportPath: ['Supervisor', 'Medium', 'Medium'] },
  { packageName: '@systemfsoftware/effect-daemon-spec', exportPath: ['Supervisor', 'Medium', 'MediumPortShape'] },
]

export const CONFORMANCE_PACKAGE = '@systemfsoftware/conformance-spec'

export const CONFORMANCE_EXPORT_PATH: readonly string[] = ['Conformance', 'stopped']

export const CONFORMANCE_NAMESPACE_PATH: readonly string[] = ['Conformance']

export const CONFORMANCE_TEST_FILENAME = /\.conformance\.test\.ts$/u
