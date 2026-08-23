import {
  type ResolutionKind,
  ResolutionKindSchema,
  type ResolutionOption,
  ResolutionOptionSchema,
} from './Problem.schema.js'
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

const resolutionKindRecord: Record<string, true> = {}
for (const kind of ResolutionKindSchema.literals) {
  resolutionKindRecord[kind] = true
}
const resolutionOptionRecord: Record<string, true> = {}
for (const option of ResolutionOptionSchema.literals) {
  resolutionOptionRecord[option] = true
}

// `Object.hasOwn`, never `in`: `in` walks the prototype chain, so `'toString' in
// record` is true and every Object.prototype member would read as a resolution
// kind. A property over arbitrary strings caught exactly that.
export const isResolutionKind = (value: string): value is ResolutionKind => Object.hasOwn(resolutionKindRecord, value)

export const isResolutionOption = (value: string): value is ResolutionOption =>
  Object.hasOwn(resolutionOptionRecord, value)
