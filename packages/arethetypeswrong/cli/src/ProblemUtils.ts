import type { ProblemKind, ResolutionKind } from '@systemfsoftware/arethetypeswrong-core'

export const CliProblemFlags = [
  'no-resolution',
  'untyped-resolution',
  'false-cjs',
  'false-esm',
  'cjs-resolves-to-esm',
  'fallback-condition',
  'cjs-only-exports-default',
  'named-exports',
  'false-export-default',
  'missing-export-equals',
  'unexpected-module-syntax',
  'internal-resolution-error',
] as const satisfies readonly string[]

export type CliProblemFlag = typeof CliProblemFlags[number]

export const problemFlagForKind = (kind: ProblemKind): CliProblemFlag => {
  switch (kind) {
    case 'NoResolution':
      return 'no-resolution'
    case 'UntypedResolution':
      return 'untyped-resolution'
    case 'FalseCJS':
      return 'false-cjs'
    case 'FalseESM':
      return 'false-esm'
    case 'CJSResolvesToESM':
      return 'cjs-resolves-to-esm'
    case 'FallbackCondition':
      return 'fallback-condition'
    case 'CJSOnlyExportsDefault':
      return 'cjs-only-exports-default'
    case 'NamedExports':
      return 'named-exports'
    case 'FalseExportDefault':
      return 'false-export-default'
    case 'MissingExportEquals':
      return 'missing-export-equals'
    case 'UnexpectedModuleSyntax':
      return 'unexpected-module-syntax'
    case 'InternalResolutionError':
      return 'internal-resolution-error'
  }
}

export const CliResolutionKinds = [
  'node10',
  'node16-cjs',
  'node16-esm',
  'bundler',
] as const satisfies readonly ResolutionKind[]

export type CliResolutionKind = typeof CliResolutionKinds[number]

export const CliModuleKinds = ['CommonJS', 'ESNext'] as const

export type CliModuleKind = typeof CliModuleKinds[number]

export const CliFormat = ['auto', 'table', 'table-flipped', 'ascii', 'json'] as const

export const CliProfile = ['strict', 'node16', 'esm-only'] as const

export const _problemKinds: readonly ProblemKind[] = [
  'NoResolution',
  'UntypedResolution',
  'FalseCJS',
  'FalseESM',
  'CJSResolvesToESM',
  'FallbackCondition',
  'CJSOnlyExportsDefault',
  'NamedExports',
  'FalseExportDefault',
  'MissingExportEquals',
  'UnexpectedModuleSyntax',
  'InternalResolutionError',
]
