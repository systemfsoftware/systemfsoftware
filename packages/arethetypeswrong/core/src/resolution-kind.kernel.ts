import {
  type ResolutionKind,
  ResolutionKindSchema,
  type ResolutionOption,
  ResolutionOptionSchema,
} from './problem.schema.js'
export const allResolutionOptions: readonly ResolutionOption[] = ['node10', 'node16', 'bundler']

export const allResolutionKinds: readonly ResolutionKind[] = [
  'node10',
  'node16-cjs',
  'node16-esm',
  'bundler',
]

export const getResolutionOption = (kind: ResolutionKind): ResolutionOption => {
  switch (kind) {
    case 'node10':
      return 'node10'
    case 'node16-cjs':
    case 'node16-esm':
      return 'node16'
    case 'bundler':
      return 'bundler'
  }
}

export const getResolutionKinds = (option: ResolutionOption): readonly ResolutionKind[] => {
  switch (option) {
    case 'node10':
      return ['node10']
    case 'node16':
      return ['node16-cjs', 'node16-esm']
    case 'bundler':
      return ['bundler']
  }
}

export const isDefined = <T>(value: T | undefined): value is T => value !== undefined

const resolutionKindSet: ReadonlySet<ResolutionKind> = new Set(ResolutionKindSchema.literals)
const resolutionOptionSet: ReadonlySet<ResolutionOption> = new Set(ResolutionOptionSchema.literals)

export const isResolutionKind = (value: string): value is ResolutionKind =>
  resolutionKindSet.has(value as ResolutionKind)

export const isResolutionOption = (value: string): value is ResolutionOption =>
  resolutionOptionSet.has(value as ResolutionOption)
