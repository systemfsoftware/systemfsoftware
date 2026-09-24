import { Effect, Result, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { dual } from 'effect/Function'
import * as Path from 'effect/Path'
import { DatasetFileRefusal } from '../dataset-file.schema.js'
import { Pack, RuleFile } from '../pack-rule.schema.js'
import type { RuleFileRefusal } from '../pack-rule.schema.js'

const refusalAt = (path: string) => (error: { readonly message: string }): DatasetFileRefusal =>
  new DatasetFileRefusal({ path, reason: error.message })

const readJsonAt = <S extends Schema.Constraint>(
  path: string,
  schema: S,
): Effect.Effect<S['Type'], DatasetFileRefusal, FileSystem.FileSystem | S['DecodingServices']> =>
  Effect.flatMap(FileSystem.FileSystem, (fileSystem) =>
    fileSystem.readFileString(path).pipe(
      Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(schema))),
      Effect.mapError(refusalAt(path)),
    ))

/** Read a JSON file and decode it through `schema`; a missing, unreadable, or malformed file is refused naming its path. */
export const readJson: {
  <S extends Schema.Constraint>(
    schema: S,
  ): (path: string) => Effect.Effect<S['Type'], DatasetFileRefusal, FileSystem.FileSystem | S['DecodingServices']>
  <S extends Schema.Constraint>(
    path: string,
    schema: S,
  ): Effect.Effect<S['Type'], DatasetFileRefusal, FileSystem.FileSystem | S['DecodingServices']>
} = dual(2, readJsonAt)

const writeJsonAt = <S extends Schema.Constraint>(
  path: string,
  schema: S,
  value: S['Type'],
): Effect.Effect<void, DatasetFileRefusal, FileSystem.FileSystem | Path.Path | S['EncodingServices']> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    const text = yield* Schema.encodeEffect(Schema.fromJsonString(schema, { space: 2 }))(value)
    yield* fileSystem.makeDirectory(paths.dirname(path), { recursive: true })
    yield* fileSystem.writeFileString(path, `${text}\n`)
  }).pipe(Effect.mapError(refusalAt(path)))

/** Encode `value` through `schema` and write it as indented JSON, creating the parent directory. */
export const writeJson: {
  <S extends Schema.Constraint>(
    schema: S,
    value: S['Type'],
  ): (
    path: string,
  ) => Effect.Effect<void, DatasetFileRefusal, FileSystem.FileSystem | Path.Path | S['EncodingServices']>
  <S extends Schema.Constraint>(
    path: string,
    schema: S,
    value: S['Type'],
  ): Effect.Effect<void, DatasetFileRefusal, FileSystem.FileSystem | Path.Path | S['EncodingServices']>
} = dual(3, writeJsonAt)

const isRuleFileName = (name: string): boolean => name.endsWith('.md') && name.toLowerCase() !== 'readme.md'

const decodedRule = (file: RuleFile): Effect.Effect<Pack['rules'][number], RuleFileRefusal> =>
  Result.match(RuleFile.decode(file), { onSuccess: Effect.succeed, onFailure: Effect.fail })

/**
 * Read one pack directory: its id is the directory name, and every top-level markdown file except
 * `README.md` is a rule, decoded in name order. Subdirectories and other files are pack assets.
 */
export const readPack = (
  dir: string,
): Effect.Effect<Pack, DatasetFileRefusal | RuleFileRefusal, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    const packId = paths.basename(paths.resolve(dir))
    const names = yield* fileSystem.readDirectory(dir).pipe(Effect.mapError(refusalAt(dir)))
    const ruleNames = names.filter(isRuleFileName).toSorted()
    const rules = yield* Effect.forEach(ruleNames, (name) => {
      const path = paths.join(dir, name)
      return fileSystem.readFileString(path).pipe(
        Effect.mapError(refusalAt(path)),
        Effect.flatMap((text) => decodedRule(new RuleFile({ path, packId, stem: name.slice(0, -'.md'.length), text }))),
      )
    })
    return new Pack({ id: packId, rules })
  })
