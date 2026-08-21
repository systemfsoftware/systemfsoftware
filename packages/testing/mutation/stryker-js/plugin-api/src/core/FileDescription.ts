import { MutationRange } from './MutationRange.js'

/**
 * Input files by file name.
 */
export type FileDescriptions = Record<string, FileDescription>

export type MutateDescription = MutationRange[] | boolean

/**
 * The metadata of a input file
 */
export interface FileDescription {
  mutate: MutateDescription
}
