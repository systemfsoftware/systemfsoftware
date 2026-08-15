import { Array as A, Schema as S } from 'effect'
import { COLOCATABLE_CELLS, PROPERTY_SUFFIX, SANCTIONED_TEST_DIRS, TEST_BASENAME } from './path.config.js'

const PathSegments = S.NonEmptyArray(S.String)

const segmentsOf = (filename: string): A.NonEmptyReadonlyArray<string> =>
  S.decodeUnknownSync(PathSegments)(filename.split('/'))

export const basenameOf = (filename: string): string => A.lastNonEmpty(segmentsOf(filename))

/** Directory segments only — the basename never counts as a directory. */
export const directoriesOf = (filename: string): readonly string[] => A.initNonEmpty(segmentsOf(filename))

export const isUnderSrc = (filename: string): boolean => directoriesOf(filename).includes('src')

export const isInSanctionedTestDir = (filename: string): boolean =>
  directoriesOf(filename).some((segment) => SANCTIONED_TEST_DIRS.has(segment))

export const isInConfiguredTestDir = (filename: string, dirs: readonly string[]): boolean =>
  directoriesOf(filename).some((segment) => dirs.includes(segment))

export const isTestFile = (basename: string): boolean => TEST_BASENAME.test(basename)

export const propertyStem = (basename: string): string => basename.slice(0, -PROPERTY_SUFFIX.length)

const TEST_SEGMENT = /\.(?:property\.)?(?:test|spec)\.[cm]?tsx?$/
const CELL_SUFFIX = /\.([^.]+)\.[cm]?tsx?$/

export const testStem = (basename: string): string => basename.replace(TEST_SEGMENT, '')

export const cellOf = (basename: string): string | undefined => CELL_SUFFIX.exec(basename)?.[1]

export const namesColocatableCell = (stem: string): boolean =>
  COLOCATABLE_CELLS.some((cell) => stem.endsWith(`.${cell}`))
