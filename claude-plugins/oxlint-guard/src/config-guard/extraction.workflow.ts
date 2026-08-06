import * as Either from 'effect/Either'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import type { ToolInput } from '../edit-command.schema.js'
import { ExtractionCommand } from './extraction-command.schema.js'

type Workflow<Command, Decision, Error> = (command: Command) => Either.Either<Decision, Error>

const ExtractionTypeId: unique symbol = Symbol.for('@systemfsoftware/oxlint-guard/Extraction')
type ExtractionTypeId = typeof ExtractionTypeId

const ContentPairSchema = S.TaggedStruct('ContentPair', {
  oldSide: S.OptionFromSelf(S.String),
  newSide: S.String,
})
export type ContentPair = S.Schema.Type<typeof ContentPairSchema>

export class PairsDecision extends S.TaggedClass<PairsDecision>()('Pairs', {
  pairs: S.NonEmptyArray(ContentPairSchema),
}) {
  readonly [ExtractionTypeId] = ExtractionTypeId
}

export class ContentlessDecision extends S.TaggedClass<ContentlessDecision>()('Contentless', {}) {
  readonly [ExtractionTypeId] = ExtractionTypeId
}

export class UnrecoverableError extends S.TaggedError<UnrecoverableError>()('Unrecoverable', {
  reason: S.String,
}) {
  readonly [ExtractionTypeId] = ExtractionTypeId
}

export const ExtractableSchema = S.Union(PairsDecision, ContentlessDecision)
export type Extractable = S.Schema.Type<typeof ExtractableSchema>

export type ExtractionEither = Either.Either<Extractable, UnrecoverableError>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isArray = (value: unknown): value is readonly unknown[] => Array.isArray(value)

// A before/after text pair applied to a buffer.
type Hunk = { readonly oldString: string; readonly newString: string }

const toPairs = (pairs: readonly ContentPair[]): ExtractionEither =>
  Match.value(Option.fromNullable(pairs[0])).pipe(
    Match.tag('Some', ({ value }) => Either.right(new PairsDecision({ pairs: [value, ...pairs.slice(1)] }))),
    Match.tag('None', () => Either.right(new ContentlessDecision())),
    Match.exhaustive,
  )

// Replace the FIRST occurrence of oldString in buffer; None when absent. An
// old_string absent from the buffer means the reconstructed document has
// diverged from what the tool will land, so callers fail closed.
const replaceFirst = (buffer: string, oldString: string, newString: string): Option.Option<string> =>
  Option.liftPredicate((index: number) => index !== -1)(buffer.indexOf(oldString)).pipe(
    Option.map((index) => buffer.slice(0, index) + newString + buffer.slice(index + oldString.length)),
  )

// Apply every hunk to the buffer sequentially — hunk N sees the buffer after
// hunks 0..N-1, exactly as MultiEdit applies its edits — replacing the first
// occurrence of each old_string.
const applyHunks = (buffer: string, hunks: readonly Hunk[]): Either.Either<string, UnrecoverableError> =>
  hunks.reduce<Either.Either<string, UnrecoverableError>>(
    (acc, hunk) =>
      acc.pipe(
        Either.flatMap((current) =>
          replaceFirst(current, hunk.oldString, hunk.newString).pipe(
            Option.match({
              onNone: () =>
                Either.left(
                  new UnrecoverableError({
                    reason: `hunk old_string ${
                      JSON.stringify(hunk.oldString)
                    } is not present in the on-disk config content`,
                  }),
                ),
              onSome: (next) => Either.right(next),
            }),
          )
        ),
      ),
    Either.right(buffer),
  )

// ONE whole-document pair per edit call: the on-disk content as the old side and
// the on-disk content with every hunk applied as the new side. A raw hunk is
// never a valid JSON document, so whole documents are what the JSON path parses.
// With no on-disk content there is no buffer to apply hunks to, and the result
// cannot be reconstructed, so the extraction fails closed rather than guess.
const reconstructedPair = (diskContent: Option.Option<string>, hunks: readonly Hunk[]): ExtractionEither =>
  Option.match(diskContent, {
    onNone: () =>
      Either.left(
        new UnrecoverableError({
          reason:
            'there is no on-disk config content to apply the edit to, so the edited result cannot be reconstructed',
        }),
      ),
    onSome: (buffer) =>
      applyHunks(buffer, hunks).pipe(
        Either.map((newSide) => new PairsDecision({ pairs: [{ _tag: 'ContentPair', oldSide: diskContent, newSide }] })),
      ),
  })

const hunkFromRecord = (record: Record<string, unknown>): Either.Either<Option.Option<Hunk>, UnrecoverableError> =>
  Match.value({ oldString: record['old_string'], newString: record['new_string'] }).pipe(
    Match.when({ oldString: undefined, newString: undefined }, () => Either.right(Option.none())),
    Match.when(
      { oldString: Match.string, newString: Match.string },
      ({ oldString, newString }) => Either.right(Option.some({ oldString, newString })),
    ),
    Match.orElse(() =>
      Either.left(new UnrecoverableError({ reason: 'an edit entry is not a valid before/after pair' }))
    ),
  )

const extractEditShape = (input: ToolInput, diskContent: Option.Option<string>): ExtractionEither =>
  hunkFromRecord(input).pipe(
    Either.flatMap((candidate) =>
      Option.match(candidate, {
        onNone: () => Either.right(new ContentlessDecision()),
        onSome: (hunk) => reconstructedPair(diskContent, [hunk]),
      })
    ),
  )

const extractWriteShape = (input: ToolInput, diskContent: Option.Option<string>): ExtractionEither =>
  Match.value({ content: input['content'] }).pipe(
    Match.when({ content: undefined }, () => Either.right(new ContentlessDecision())),
    Match.when(
      { content: Match.string },
      ({ content }) => toPairs([{ _tag: 'ContentPair', oldSide: diskContent, newSide: content }]),
    ),
    Match.orElse(() =>
      Either.left(new UnrecoverableError({ reason: 'Write/Create payload carries non-string content' }))
    ),
  )

const entryRecord = (entry: unknown): Option.Option<Record<string, unknown>> =>
  Match.value({ entry }).pipe(
    Match.when({ entry: isRecord }, ({ entry }) => Option.some(entry)),
    Match.orElse(() => Option.none()),
  )

const entryHunk = (entry: unknown): Either.Either<Option.Option<Hunk>, UnrecoverableError> =>
  Match.value(entryRecord(entry)).pipe(
    Match.tag('Some', ({ value }) => hunkFromRecord(value)),
    Match.tag(
      'None',
      () =>
        Either.left(new UnrecoverableError({ reason: 'a MultiEdit/Update entry is not a valid before/after pair' })),
    ),
    Match.exhaustive,
  )

const hunksFromEntries = (entries: readonly unknown[]): Either.Either<readonly Hunk[], UnrecoverableError> =>
  entries.reduce<Either.Either<readonly Hunk[], UnrecoverableError>>(
    (acc, entry) =>
      acc.pipe(
        Either.flatMap((hunks) =>
          entryHunk(entry).pipe(
            Either.map((candidate) =>
              Option.match(candidate, {
                onNone: () => hunks,
                onSome: (hunk) => [...hunks, hunk],
              })
            ),
          )
        ),
      ),
    Either.right<readonly Hunk[]>([]),
  )

const pairFromHunks = (diskContent: Option.Option<string>, hunks: readonly Hunk[]): ExtractionEither =>
  Match.value(Option.fromNullable(hunks[0])).pipe(
    Match.tag('Some', () => reconstructedPair(diskContent, hunks)),
    Match.tag('None', () => Either.right(new ContentlessDecision())),
    Match.exhaustive,
  )

const extractMultiShape = (input: ToolInput, diskContent: Option.Option<string>): ExtractionEither =>
  Match.value({ edits: input['edits'] }).pipe(
    Match.when({ edits: undefined }, () => extractEditShape(input, diskContent)),
    Match.when(
      { edits: isArray },
      ({ edits }) => hunksFromEntries(edits).pipe(Either.flatMap((hunks) => pairFromHunks(diskContent, hunks))),
    ),
    Match.orElse(() =>
      Either.left(new UnrecoverableError({ reason: 'MultiEdit/Update payload carries non-array edits' }))
    ),
  )

const findReplaceHunk = (entry: unknown): Either.Either<Option.Option<Hunk>, UnrecoverableError> =>
  Match.value(entryRecord(entry)).pipe(
    Match.tag('Some', ({ value }) =>
      Match.value({ find: value['find'], replace: value['replace'] }).pipe(
        Match.when({ find: undefined, replace: undefined }, () => Either.right(Option.none())),
        Match.when(
          { find: Match.string, replace: Match.string },
          ({ find, replace }) => Either.right(Option.some({ oldString: find, newString: replace })),
        ),
        Match.orElse(() =>
          Either.left(new UnrecoverableError({ reason: 'a morph file_edits entry is not a valid find/replace pair' }))
        ),
      )),
    Match.tag(
      'None',
      () =>
        Either.left(new UnrecoverableError({ reason: 'a morph file_edits entry is not a valid find/replace pair' })),
    ),
    Match.exhaustive,
  )

const extractMorphShape = (input: ToolInput, diskContent: Option.Option<string>): ExtractionEither => {
  const contentKeys = Object.keys(input).filter((key) => key !== 'file_path')
  return Match.value(Option.fromNullable(contentKeys[0])).pipe(
    Match.tag('Some', () =>
      Match.value({ edits: input['edits'], fileEdits: input['file_edits'] }).pipe(
        Match.when({ edits: isArray }, ({ edits }) =>
          hunksFromEntries(edits).pipe(Either.flatMap((hunks) => pairFromHunks(diskContent, hunks)))),
        Match.when({ fileEdits: isArray }, ({ fileEdits }) =>
          fileEdits.reduce<Either.Either<readonly Hunk[], UnrecoverableError>>(
            (acc, entry) =>
              acc.pipe(
                Either.flatMap((hunks) =>
                  findReplaceHunk(entry).pipe(
                    Either.map((candidate) =>
                      Option.match(candidate, {
                        onNone: () =>
                          hunks,
                        onSome: (hunk) => [...hunks, hunk],
                      })
                    ),
                  )
                ),
              ),
            Either.right<readonly Hunk[]>([]),
          ).pipe(Either.flatMap((hunks) =>
            pairFromHunks(diskContent, hunks)
          ))),
        Match.orElse(() =>
          Either.left(
            new UnrecoverableError({
              reason: `raw morph content (${contentKeys.join(', ')}) cannot be turned into a before/after pair`,
            }),
          )
        ),
      )),
    Match.tag('None', () => Either.right(new ContentlessDecision())),
    Match.exhaustive,
  )
}

const toolShapeOf = (name: string): 'edit' | 'write' | 'create' | 'multi' | 'morph' =>
  Match.value({ name }).pipe(
    Match.when({ name: 'Edit' }, () => 'edit' as const),
    Match.when({ name: 'Write' }, () => 'write' as const),
    Match.when({ name: 'Create' }, () => 'create' as const),
    Match.when({ name: 'Update' }, () => 'multi' as const),
    Match.when({ name: 'MultiEdit' }, () => 'multi' as const),
    Match.orElse(() => 'morph' as const),
  )

export const extractPairs: Workflow<ExtractionCommand, Extractable, UnrecoverableError> = (
  input: ExtractionCommand,
): Either.Either<Extractable, UnrecoverableError> =>
  Match.value(toolShapeOf(input.command.toolName)).pipe(
    Match.when('edit', () => extractEditShape(input.command.toolInput, input.diskContent)),
    Match.when('write', () => extractWriteShape(input.command.toolInput, input.diskContent)),
    Match.when('create', () => extractWriteShape(input.command.toolInput, input.diskContent)),
    Match.when('multi', () => extractMultiShape(input.command.toolInput, input.diskContent)),
    Match.when('morph', () => extractMorphShape(input.command.toolInput, input.diskContent)),
    Match.exhaustive,
  )
