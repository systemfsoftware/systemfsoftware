import { Function } from 'effect'
import { SystemfError } from './errors.schema.js'
import { EXIT_USAGE } from './result.js'

export { SystemfError }

/** The process exit code every `SystemfError` carries: the check could not run. */
export const EXIT_OF_ERROR = EXIT_USAGE

export const unknown = (message: string): SystemfError => SystemfError.make({ code: 'ERR_UNKNOWN', message })

export const invalidOption = (message: string): SystemfError =>
  SystemfError.make({ code: 'ERR_INVALID_OPTION', message })

export const invalidArgument = (message: string): SystemfError =>
  SystemfError.make({ code: 'ERR_INVALID_ARGUMENT', message })

export const missingArgument = (message: string): SystemfError =>
  SystemfError.make({ code: 'ERR_MISSING_ARGUMENT', message })

export const notAPackage = (path: string): SystemfError =>
  SystemfError.make({ code: 'ERR_NOT_A_PACKAGE', message: `${path}: not a package (no readable package.json)` })

export const tsconfigNotFound: {
  (searched: readonly string[]): (packageRoot: string) => SystemfError
  (packageRoot: string, searched: readonly string[]): SystemfError
} = Function.dual(
  2,
  (packageRoot: string, searched: readonly string[]): SystemfError =>
    SystemfError.make({
      code: 'ERR_TSCONFIG_NOT_FOUND',
      message: `no tsconfig found under ${packageRoot} (searched ${searched.join(', ')})`,
    }),
)

export const unknownRule: {
  (known: readonly string[]): (rule: string) => SystemfError
  (rule: string, known: readonly string[]): SystemfError
} = Function.dual(
  2,
  (rule: string, known: readonly string[]): SystemfError =>
    SystemfError.make({
      code: 'ERR_UNKNOWN_RULE',
      message: `unknown rule ${rule}`,
      suggestions: nearest(known, rule),
    }),
)

export const unknownUnit: {
  (known: readonly string[]): (query: string) => SystemfError
  (query: string, known: readonly string[]): SystemfError
} = Function.dual(
  2,
  (query: string, known: readonly string[]): SystemfError =>
    SystemfError.make({
      code: 'ERR_UNKNOWN_UNIT',
      message: `no unit matches ${query}`,
      suggestions: closest(known, query),
    }),
)

export const ambiguousUnit: {
  (matches: readonly string[]): (query: string) => SystemfError
  (query: string, matches: readonly string[]): SystemfError
} = Function.dual(
  2,
  (query: string, matches: readonly string[]): SystemfError =>
    SystemfError.make({
      code: 'ERR_AMBIGUOUS_UNIT',
      message: `${query} matches ${matches.length} units: ${matches.join(', ')}`,
      suggestions: matches,
    }),
)

const at = (row: readonly number[], index: number): number => row[index] ?? 0

const stepCost = (leftChar: string, rightChar: string): number => Number(leftChar !== rightChar)

const cellOf = (row: readonly number[], cells: readonly number[], index: number, cost: number): number =>
  Math.min(at(row, index + 1) + 1, at(cells, index) + 1, at(row, index) + cost)

const rowOf = (row: readonly number[], leftChar: string, leftIndex: number, right: string): readonly number[] =>
  Array.from(right).reduce<readonly number[]>(
    (cells, rightChar, index) => [...cells, cellOf(row, cells, index, stepCost(leftChar, rightChar))],
    [leftIndex + 1],
  )

const initialRow = (length: number): readonly number[] => Array.from({ length }, (_, index) => index)

const distance = (left: string, right: string): number => {
  const rows = Array.from(left).reduce<readonly number[]>(
    (row, leftChar, leftIndex) => rowOf(row, leftChar, leftIndex, right),
    initialRow(right.length + 1),
  )
  return at(rows, right.length)
}

const ranked = (
  known: readonly string[],
  input: string,
): readonly { readonly name: string; readonly score: number }[] =>
  known
    .map((name) => ({ name, score: distance(name, input) }))
    .sort((left, right) => left.score - right.score)

const namesOf = (entries: readonly { readonly name: string }[]): readonly string[] => entries.map((entry) => entry.name)

const nearest = (known: readonly string[], input: string): readonly string[] =>
  namesOf(ranked(known, input).slice(0, 3))

const nearEnough = (input: string, score: number): boolean => score <= Math.max(2, Math.floor(input.length / 2))

const closest = (known: readonly string[], input: string): readonly string[] =>
  namesOf(ranked(known, input).filter((entry) => nearEnough(input, entry.score)).slice(0, 3))
