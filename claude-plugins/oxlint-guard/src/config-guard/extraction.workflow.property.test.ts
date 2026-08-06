import { describe, it } from '@effect/vitest'
import { FastCheck as fc } from 'effect'
import * as Either from 'effect/Either'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import { EditCommand } from '../edit-command.schema.js'
import { ExtractionCommand } from './extraction-command.schema.js'
import { type Extractable, extractPairs, PairsDecision } from './extraction.workflow.js'

const makeCommand = (toolName: string, toolInput: object, filePath = 'oxlint.json'): EditCommand => {
  const decoded = S.decodeUnknownEither(EditCommand)({ _tag: 'EditCommand', toolName, filePath, toolInput })
  if (Either.isLeft(decoded)) {
    throw new Error(`test command failed to decode: ${String(decoded.left)}`)
  }
  return decoded.right
}

const commandOf = (command: EditCommand, diskContent: Option.Option<string>): ExtractionCommand =>
  new ExtractionCommand({ command, diskContent })

const someOrNone = (value: string | undefined): Option.Option<string> =>
  value === undefined ? Option.none() : Option.some(value)

const diskArb = fc.option(fc.string(), { nil: undefined })

const isPairs = (result: Either.Either<Extractable, unknown>): result is Either.Right<unknown, PairsDecision> =>
  Either.isRight(result) && result.right._tag === 'Pairs'

const newSideOf = (result: Extract<Extractable, { readonly _tag: 'Pairs' }>): string => result.pairs[0].newSide

const sameOldSideAs = (
  result: Extract<Extractable, { readonly _tag: 'Pairs' }>,
  expected: string | undefined,
): boolean =>
  Option.match(result.pairs[0].oldSide, { onNone: () => expected === undefined, onSome: (value) => value === expected })

describe('extractPairs — Edit shape', () => {
  it.prop(
    '∀e_EditHunkAppliedToDisk_=WholeDocumentPair',
    [fc.string(), fc.string(), fc.string()],
    ([oldString, newString, suffix]) => {
      const disk = oldString + suffix
      const result = extractPairs(
        commandOf(makeCommand('Edit', { old_string: oldString, new_string: newString }), Option.some(disk)),
      )
      if (!isPairs(result)) return false
      return result.right.pairs.length === 1 &&
        Option.isSome(result.right.pairs[0].oldSide) &&
        result.right.pairs[0].oldSide.value === disk &&
        result.right.pairs[0].newSide === newString + suffix
    },
  )

  it.prop(
    '∀e_EditFirstOccurrence_=Replaced',
    [fc.string(), fc.string()],
    ([newString, suffix]) => {
      const disk = `old ${newString} old${suffix}`
      const result = extractPairs(
        commandOf(makeCommand('Edit', { old_string: 'old', new_string: newString }), Option.some(disk)),
      )
      if (!isPairs(result)) return false
      // Only the FIRST 'old' is replaced; a second occurrence further on survives.
      return result.right.pairs[0].newSide === `${newString} ${newString} old${suffix}`
    },
  )

  it.prop(
    '∀e_EditWithoutDisk_=Unrecoverable',
    [fc.string(), fc.string()],
    ([oldString, newString]) => {
      const result = extractPairs(
        commandOf(makeCommand('Edit', { old_string: oldString, new_string: newString }), Option.none()),
      )
      return Either.isLeft(result)
    },
  )

  it.prop(
    '∀e_EditAbsentHunk_=Unrecoverable',
    [
      fc.array(fc.constantFrom('a', 'b', 'c', ' ', '\n'), { maxLength: 12 }).map((chars) => chars.join('')),
      fc.string({ maxLength: 10 }),
      fc.string({ maxLength: 10 }),
    ],
    ([disk, oldString, newString]) => {
      // Brackets cannot appear in the 'abc' alphabet disk, so the bracketed
      // hunk old_string can never be present: the reconstruction must fail closed.
      const result = extractPairs(
        commandOf(
          makeCommand('Edit', { old_string: `[${oldString}]`, new_string: newString }),
          Option.some(disk),
        ),
      )
      return Either.isLeft(result)
    },
  )

  it.prop(
    '∀e_EditNeitherSide_=Contentless',
    [fc.record({ unrelated: fc.string() })],
    ([input]) => {
      const result = extractPairs(commandOf(makeCommand('Edit', input), Option.none()))
      return Either.isRight(result) && result.right._tag === 'Contentless'
    },
  )

  it.prop(
    '∀e_EditOneSide_=Unrecoverable',
    [fc.record({ old_string: fc.string() }), fc.record({ new_string: fc.string() })],
    ([oldOnly, newOnly]) =>
      Either.isLeft(extractPairs(commandOf(makeCommand('Edit', oldOnly), Option.none()))) &&
      Either.isLeft(extractPairs(commandOf(makeCommand('Edit', newOnly), Option.none()))),
  )

  it.prop(
    '∀e_EditNonStringSide_=Unrecoverable',
    [
      fc.oneof(fc.constant(42), fc.constant(true), fc.constant({ nested: 'x' })),
      fc.constantFrom('old_string', 'new_string'),
    ],
    ([bad, key]) => Either.isLeft(extractPairs(commandOf(makeCommand('Edit', { [key]: bad }), Option.none()))),
  )
})

describe('extractPairs — Write/Create shape', () => {
  it.prop(
    '∀w_WriteContent_=DiskPair',
    [fc.string(), diskArb],
    ([content, disk]) => {
      const result = extractPairs(commandOf(makeCommand('Write', { content }), someOrNone(disk)))
      if (!isPairs(result)) return false
      return result.right.pairs[0].newSide === content && sameOldSideAs(result.right, disk)
    },
  )

  it.prop(
    '∀w_WriteNoContent_=Contentless',
    [fc.record({ other: fc.string() })],
    ([input]) => {
      const result = extractPairs(commandOf(makeCommand('Write', input), Option.none()))
      return Either.isRight(result) && result.right._tag === 'Contentless'
    },
  )

  it.prop(
    '∀c_CreateContent_=DiskPair',
    [fc.string(), diskArb],
    ([content, disk]) => {
      const result = extractPairs(commandOf(makeCommand('Create', { content }), someOrNone(disk)))
      if (!isPairs(result)) return false
      return newSideOf(result.right) === content && sameOldSideAs(result.right, disk)
    },
  )
})

const bothSidesEntry = fc.record({ old_string: fc.string(), new_string: fc.string() })

// Entries whose old_strings are pairwise-distinct tokens from a fixed set and
// whose new_strings come from a disjoint alphabet: each hunk targets exactly one
// position in the joined disk and no replacement can disturb a later hunk.
const distinctTokenEntries = fc
  .array(
    fc.tuple(
      fc.constantFrom('alpha', 'beta', 'gamma', 'delta'),
      fc.array(fc.constantFrom('a', 'b', 'c'), { maxLength: 6 }).map((chars) => chars.join('')),
    ),
    { minLength: 1, maxLength: 4 },
  )
  .filter((pairs) => new Set(pairs.map(([token]) => token)).size === pairs.length)
  .map((pairs) => pairs.map(([old_string, new_string]) => ({ old_string, new_string })))

describe('extractPairs — MultiEdit/Update shape', () => {
  it.prop(
    '∀m_MultiEditDistinctHunks_=AppliedNewSide',
    [distinctTokenEntries],
    ([entries]) => {
      const disk = entries.map((e) => e.old_string).join('\n')
      const expected = entries.reduce((acc, e) => acc.replace(e.old_string, e.new_string), disk)
      const result = extractPairs(commandOf(makeCommand('MultiEdit', { edits: entries }), Option.some(disk)))
      if (!isPairs(result)) return false
      return result.right.pairs.length === 1 &&
        Option.isSome(result.right.pairs[0].oldSide) &&
        result.right.pairs[0].oldSide.value === disk &&
        result.right.pairs[0].newSide === expected
    },
  )

  it.prop(
    '∀m_MultiEditChainedHunks_=ChainedNewSide',
    [fc.constant(null)],
    () => {
      const result = extractPairs(
        commandOf(
          makeCommand('MultiEdit', {
            edits: [
              { old_string: 'severity: warn', new_string: 'severity: error' },
              { old_string: 'severity: error', new_string: 'severity: off' },
            ],
          }),
          Option.some('rules: { severity: warn }'),
        ),
      )
      // Hunk 2 targets the output of hunk 1, so applying the edits to the
      // original buffer in parallel would fail instead of producing this result.
      if (!isPairs(result)) return false
      return result.right.pairs.length === 1 &&
        Option.isSome(result.right.pairs[0].oldSide) &&
        result.right.pairs[0].oldSide.value === 'rules: { severity: warn }' &&
        result.right.pairs[0].newSide === 'rules: { severity: off }'
    },
  )

  it.prop(
    '∀m_MultiEditWithoutDisk_=Unrecoverable',
    [fc.array(bothSidesEntry, { minLength: 1 })],
    ([entries]) => {
      const result = extractPairs(commandOf(makeCommand('MultiEdit', { edits: entries }), Option.none()))
      return Either.isLeft(result)
    },
  )

  it.prop(
    '∀m_MultiEditEmptyEntries_=Contentless',
    [fc.array(fc.record({ other: fc.string() }), { minLength: 1 })],
    ([entries]) => {
      const result = extractPairs(commandOf(makeCommand('MultiEdit', { edits: entries }), Option.none()))
      return Either.isRight(result) && result.right._tag === 'Contentless'
    },
  )

  it.prop(
    '∀m_MultiEditPartialEntry_=Unrecoverable',
    [fc.array(bothSidesEntry, { minLength: 1 }), fc.constantFrom('old_string', 'new_string')],
    ([entries, dropped]) => {
      const tampered = entries.map((entry) =>
        dropped === 'old_string' ? { new_string: entry.new_string } : { old_string: entry.old_string }
      )
      return Either.isLeft(extractPairs(commandOf(makeCommand('MultiEdit', { edits: tampered }), Option.none())))
    },
  )

  it.prop(
    '∀m_MultiEditNonRecordEntry_=Unrecoverable',
    [fc.oneof(fc.constant(42), fc.constant('hunk'), fc.constant(['a']))],
    ([entry]) => Either.isLeft(extractPairs(commandOf(makeCommand('Update', { edits: [entry] }), Option.none()))),
  )

  it.prop(
    '∀m_MultiEditNoEditsKey_=TopLevelFallback',
    [fc.string(), fc.string()],
    ([oldString, newString]) => {
      const result = extractPairs(
        commandOf(
          makeCommand('Update', { old_string: oldString, new_string: newString }),
          Option.some(oldString),
        ),
      )
      if (!isPairs(result)) return false
      return result.right.pairs.length === 1 &&
        result.right.pairs[0].newSide === newString &&
        Option.isSome(result.right.pairs[0].oldSide) &&
        result.right.pairs[0].oldSide.value === oldString
    },
  )

  it.prop(
    '∀m_MultiEditNonArray_=Unrecoverable',
    [fc.oneof(fc.constant(42), fc.constant('edits'), fc.constant({ a: 1 }))],
    ([edits]) => Either.isLeft(extractPairs(commandOf(makeCommand('MultiEdit', { edits }), Option.none()))),
  )
})

describe('extractPairs — morph shape', () => {
  it.prop(
    '∀o_MorphFileEditsWithoutDisk_=Unrecoverable',
    [fc.array(fc.record({ find: fc.string(), replace: fc.string() }), { minLength: 1 })],
    ([fileEdits]) =>
      Either.isLeft(
        extractPairs(commandOf(makeCommand('morph_mcp_edit-file', { file_edits: fileEdits }), Option.none())),
      ),
  )

  it.prop(
    '∀o_MorphFileEditsWithDisk_=ReconstructedPair',
    [fc.array(fc.record({ find: fc.string(), replace: fc.string() }), { minLength: 1 })],
    ([fileEdits]) => {
      const disk = fileEdits.map((e) => e.find).join('\n')
      const result = extractPairs(
        commandOf(makeCommand('morph_mcp_edit-file', { file_edits: fileEdits }), Option.some(disk)),
      )
      if (!isPairs(result)) return false
      return result.right.pairs.length === 1 && sameOldSideAs(result.right, disk)
    },
  )

  it.prop(
    '∀o_MorphUnrecognizedContent_=Unrecoverable',
    [fc.oneof(fc.constant('edits'), fc.constant({ file_edits: 'raw' }))],
    ([content]) => {
      const result = extractPairs(commandOf(makeCommand('morph_mcp_edit-file', { content }), Option.some('disk')))
      return Either.isLeft(result)
    },
  )

  it.prop(
    '∀o_MorphOnlyPath_=Contentless',
    [fc.constantFrom('morph_edit', 'morph_mcp_edit-file')],
    ([toolName]) => {
      const result = extractPairs(commandOf(makeCommand(toolName, { file_path: 'oxlint.json' }), Option.none()))
      return Either.isRight(result) && result.right._tag === 'Contentless'
    },
  )
})
