import { Array as Arr, Option, Schema } from 'effect'
import { parse } from 'yaml'
import { type Patch, Patch as PatchEntry } from './Entry.schema.js'
import { asRecord, objectEntries, type Raw } from './raw.js'

export interface PnpmWorkspaceFile {
  readonly file: string
  readonly text: string
}

const stringOrNone = (value: Raw): Option.Option<string> => Schema.decodeUnknownOption(Schema.String)(value)

const patchOf = (file: string) => ([dependency, patchPath]: readonly [string, Raw]): ReadonlyArray<Patch> =>
  Option.match(stringOrNone(patchPath), {
    onNone: () => [],
    onSome: (patch) => [PatchEntry.make({ file, dependency, patch })],
  })

export const scanPnpmPatches = (input: PnpmWorkspaceFile): ReadonlyArray<Patch> =>
  Option.getOrElse(
    Option.map(
      Option.flatMap(asRecord(parse(input.text)), (workspace) => asRecord(workspace['patchedDependencies'])),
      (patchedDependencies) => Arr.flatMap(objectEntries(patchedDependencies), patchOf(input.file)),
    ),
    (): ReadonlyArray<Patch> => [],
  )
