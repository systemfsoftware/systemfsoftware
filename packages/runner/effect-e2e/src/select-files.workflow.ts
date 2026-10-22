import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const ANY_DIRECTORIES = '\u0000'

const globToRegExp = (pattern: string): RegExp =>
  new RegExp(
    `^${
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*\//g, ANY_DIRECTORIES)
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
        .replaceAll(ANY_DIRECTORIES, '(?:[^/]+/)*')
    }$`,
  )

const matchesGlob = (pattern: string, path: string): boolean => globToRegExp(pattern).test(path)

const SelectionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/Selection')
type SelectionTypeId = typeof SelectionTypeId

export class FilesSelected extends Schema.TaggedClass<FilesSelected>()('FilesSelected', {
  files: Schema.Array(Schema.String),
}) {
  readonly [SelectionTypeId] = SelectionTypeId
}

export class NoFilesMatched extends Schema.TaggedClass<NoFilesMatched>()('NoFilesMatched', {
  patterns: Schema.Array(Schema.String),
}) {
  readonly [SelectionTypeId] = SelectionTypeId
}
export const Selection = Schema.Union([FilesSelected, NoFilesMatched])
export type Selection = typeof Selection.Type

export class SelectTestFiles extends Schema.TaggedClass<SelectTestFiles>()('SelectTestFiles', {
  patterns: Schema.Array(Schema.String),
  candidates: Schema.Array(Schema.String),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const applyPattern = (
  state: ReadonlyArray<string>,
  command: SelectTestFiles,
  pattern: string,
): ReadonlyArray<string> =>
  Match.value(pattern.startsWith('!')).pipe(
    Match.when(true, () => state.filter((file) => !matchesGlob(pattern.slice(1), file))),
    Match.when(false, () => [
      ...state,
      ...command.candidates
        .filter((file) => matchesGlob(pattern, file))
        .filter((file) => !state.includes(file)),
    ]),
    Match.exhaustive,
  )

const decide = (command: SelectTestFiles): Result.Result<Selection, never> => {
  const selected = command.patterns.reduce(
    (state: ReadonlyArray<string>, pattern) => applyPattern(state, command, pattern),
    [],
  )
  return Result.succeed(
    Match.value(selected.length === 0).pipe(
      Match.when(true, () => new NoFilesMatched({ patterns: command.patterns })),
      Match.when(false, () => new FilesSelected({ files: selected })),
      Match.exhaustive,
    ),
  )
}
export const selectFiles = Workflow.make({
  command: SelectTestFiles,
  decision: Selection,
  error: Schema.Never,
  decide,
})
