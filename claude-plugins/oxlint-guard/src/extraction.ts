import { err, ok } from './result.ts'
import type { Result } from './result.ts'
import type { EditCommand } from './schemas.ts'

export interface ContentPair {
  readonly _tag: 'ContentPair'
  readonly oldSide: string | undefined
  readonly newSide: string
}

export interface PairsDecision {
  readonly _tag: 'Pairs'
  readonly pairs: readonly ContentPair[]
}

export const PairsDecision = (input: { readonly pairs: readonly ContentPair[] }): PairsDecision => ({
  _tag: 'Pairs',
  pairs: input.pairs,
})

export interface ContentlessDecision {
  readonly _tag: 'Contentless'
}

export const ContentlessDecision = (): ContentlessDecision => ({ _tag: 'Contentless' })

export interface UnrecoverableError {
  readonly _tag: 'Unrecoverable'
  readonly reason: string
}

export const UnrecoverableError = (input: { readonly reason: string }): UnrecoverableError => ({
  _tag: 'Unrecoverable',
  reason: input.reason,
})

export type Extractable = PairsDecision | ContentlessDecision

export type ExtractionEither = Result<Extractable, UnrecoverableError>

export interface ExtractionCommand {
  readonly command: EditCommand
  readonly diskContent: string | undefined
}

export const ExtractionCommand = (input: ExtractionCommand): ExtractionCommand => input

type ToolInput = Readonly<Record<string, unknown>>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isArray = (value: unknown): value is readonly unknown[] => Array.isArray(value)

// A before/after text pair applied to a buffer.
type Hunk = { readonly oldString: string; readonly newString: string }

const toPairs = (pairs: readonly ContentPair[]): ExtractionEither => {
  const head = pairs[0]
  if (head === undefined) {
    return ok(ContentlessDecision())
  }
  return ok(PairsDecision({ pairs: [head, ...pairs.slice(1)] }))
}

// Replace the FIRST occurrence of oldString in buffer; undefined when absent. An
// old_string absent from the buffer means the reconstructed document has
// diverged from what the tool will land, so callers fail closed.
const replaceFirst = (buffer: string, oldString: string, newString: string): string | undefined => {
  const index = buffer.indexOf(oldString)
  if (index === -1) {
    return undefined
  }
  return buffer.slice(0, index) + newString + buffer.slice(index + oldString.length)
}

// Apply every hunk to the buffer sequentially — hunk N sees the buffer after
// hunks 0..N-1, exactly as MultiEdit applies its edits — replacing the first
// occurrence of each old_string.
const applyHunks = (buffer: string, hunks: readonly Hunk[]): Result<string, UnrecoverableError> =>
  hunks.reduce<Result<string, UnrecoverableError>>(
    (acc, hunk) => {
      if (!acc.ok) {
        return acc
      }
      const next = replaceFirst(acc.value, hunk.oldString, hunk.newString)
      if (next === undefined) {
        return err(
          UnrecoverableError({
            reason: `hunk old_string ${JSON.stringify(hunk.oldString)} is not present in the on-disk config content`,
          }),
        )
      }
      return ok(next)
    },
    ok(buffer),
  )

// ONE whole-document pair per edit call: the on-disk content as the old side and
// the on-disk content with every hunk applied as the new side. A raw hunk is
// never a valid JSON document, so whole documents are what the JSON path parses.
// With no on-disk content there is no buffer to apply hunks to, and the result
// cannot be reconstructed, so the extraction fails closed rather than guess.
const reconstructedPair = (diskContent: string | undefined, hunks: readonly Hunk[]): ExtractionEither => {
  if (diskContent === undefined) {
    return err(
      UnrecoverableError({
        reason: 'there is no on-disk config content to apply the edit to, so the edited result cannot be reconstructed',
      }),
    )
  }
  const applied = applyHunks(diskContent, hunks)
  if (!applied.ok) {
    return applied
  }
  return ok(PairsDecision({ pairs: [{ _tag: 'ContentPair', oldSide: diskContent, newSide: applied.value }] }))
}

const hunkFromRecord = (record: Record<string, unknown>): Result<Hunk | undefined, UnrecoverableError> => {
  const oldString = record['old_string']
  const newString = record['new_string']
  if (oldString === undefined && newString === undefined) {
    return ok(undefined)
  }
  if (typeof oldString === 'string' && typeof newString === 'string') {
    return ok({ oldString, newString })
  }
  return err(UnrecoverableError({ reason: 'an edit entry is not a valid before/after pair' }))
}

const extractEditShape = (input: ToolInput, diskContent: string | undefined): ExtractionEither => {
  const candidate = hunkFromRecord(input)
  if (!candidate.ok) {
    return candidate
  }
  const hunk = candidate.value
  if (hunk === undefined) {
    return ok(ContentlessDecision())
  }
  return reconstructedPair(diskContent, [hunk])
}

const extractWriteShape = (input: ToolInput, diskContent: string | undefined): ExtractionEither => {
  const content = input['content']
  if (content === undefined) {
    return ok(ContentlessDecision())
  }
  if (typeof content === 'string') {
    return toPairs([{ _tag: 'ContentPair', oldSide: diskContent, newSide: content }])
  }
  return err(UnrecoverableError({ reason: 'Write/Create payload carries non-string content' }))
}

const entryRecord = (entry: unknown): Record<string, unknown> | undefined => (isRecord(entry) ? entry : undefined)

const entryHunk = (entry: unknown): Result<Hunk | undefined, UnrecoverableError> => {
  const record = entryRecord(entry)
  if (record === undefined) {
    return err(UnrecoverableError({ reason: 'a MultiEdit/Update entry is not a valid before/after pair' }))
  }
  return hunkFromRecord(record)
}

const hunksFromEntries = (entries: readonly unknown[]): Result<readonly Hunk[], UnrecoverableError> =>
  entries.reduce<Result<readonly Hunk[], UnrecoverableError>>(
    (acc, entry) => {
      if (!acc.ok) {
        return acc
      }
      const candidate = entryHunk(entry)
      if (!candidate.ok) {
        return candidate
      }
      const hunk = candidate.value
      if (hunk === undefined) {
        return acc
      }
      return ok([...acc.value, hunk])
    },
    ok([]),
  )

const pairFromHunks = (diskContent: string | undefined, hunks: readonly Hunk[]): ExtractionEither => {
  const head = hunks[0]
  if (head === undefined) {
    return ok(ContentlessDecision())
  }
  return reconstructedPair(diskContent, hunks)
}

const extractMultiShape = (input: ToolInput, diskContent: string | undefined): ExtractionEither => {
  const edits = input['edits']
  if (edits === undefined) {
    return extractEditShape(input, diskContent)
  }
  if (isArray(edits)) {
    const hunks = hunksFromEntries(edits)
    if (!hunks.ok) {
      return hunks
    }
    return pairFromHunks(diskContent, hunks.value)
  }
  return err(UnrecoverableError({ reason: 'MultiEdit/Update payload carries non-array edits' }))
}

const findReplaceHunk = (entry: unknown): Result<Hunk | undefined, UnrecoverableError> => {
  const record = entryRecord(entry)
  if (record === undefined) {
    return err(UnrecoverableError({ reason: 'a morph file_edits entry is not a valid find/replace pair' }))
  }
  const find = record['find']
  const replace = record['replace']
  if (find === undefined && replace === undefined) {
    return ok(undefined)
  }
  if (typeof find === 'string' && typeof replace === 'string') {
    return ok({ oldString: find, newString: replace })
  }
  return err(UnrecoverableError({ reason: 'a morph file_edits entry is not a valid find/replace pair' }))
}

const extractMorphShape = (input: ToolInput, diskContent: string | undefined): ExtractionEither => {
  const contentKeys = Object.keys(input).filter((key) => key !== 'file_path')
  const head = contentKeys[0]
  if (head === undefined) {
    return ok(ContentlessDecision())
  }
  const edits = input['edits']
  if (isArray(edits)) {
    const hunks = hunksFromEntries(edits)
    if (!hunks.ok) {
      return hunks
    }
    return pairFromHunks(diskContent, hunks.value)
  }
  const fileEdits = input['file_edits']
  if (isArray(fileEdits)) {
    const hunks = fileEdits.reduce<Result<readonly Hunk[], UnrecoverableError>>(
      (acc, entry) => {
        if (!acc.ok) {
          return acc
        }
        const candidate = findReplaceHunk(entry)
        if (!candidate.ok) {
          return candidate
        }
        const hunk = candidate.value
        if (hunk === undefined) {
          return acc
        }
        return ok([...acc.value, hunk])
      },
      ok([]),
    )
    if (!hunks.ok) {
      return hunks
    }
    return pairFromHunks(diskContent, hunks.value)
  }
  return err(
    UnrecoverableError({
      reason: `raw morph content (${contentKeys.join(', ')}) cannot be turned into a before/after pair`,
    }),
  )
}

const toolShapeOf = (name: string): 'edit' | 'write' | 'create' | 'multi' | 'morph' => {
  if (name === 'Edit') {
    return 'edit'
  }
  if (name === 'Write') {
    return 'write'
  }
  if (name === 'Create') {
    return 'create'
  }
  if (name === 'Update') {
    return 'multi'
  }
  if (name === 'MultiEdit') {
    return 'multi'
  }
  return 'morph'
}

export const extractPairs = (input: ExtractionCommand): ExtractionEither => {
  switch (toolShapeOf(input.command.toolName)) {
    case 'edit':
      return extractEditShape(input.command.toolInput, input.diskContent)
    case 'write':
      return extractWriteShape(input.command.toolInput, input.diskContent)
    case 'create':
      return extractWriteShape(input.command.toolInput, input.diskContent)
    case 'multi':
      return extractMultiShape(input.command.toolInput, input.diskContent)
    case 'morph':
      return extractMorphShape(input.command.toolInput, input.diskContent)
  }
}
