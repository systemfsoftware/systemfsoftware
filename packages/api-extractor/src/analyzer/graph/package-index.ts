import { HashMap, HashSet, Option, Schema } from 'effect'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import type { Json } from 'effect/Schema'

import type { JsonRecord } from '../../config/json-record.schema.js'
import { JsonRecordFromString } from '../../config/json-record.schema.js'

export interface INodePackageJson {
  readonly name?: string | undefined
  readonly version?: string | undefined
  readonly main?: string | undefined
  readonly types?: string | undefined
  readonly typings?: string | undefined
  readonly tsdocMetadata?: string | undefined
  readonly exports?: Schema.Json | undefined
  readonly typesVersions?: Schema.Json | undefined
  readonly dependencies?: Readonly<Record<string, string>> | undefined
  readonly devDependencies?: Readonly<Record<string, string>> | undefined
  readonly peerDependencies?: Readonly<Record<string, string>> | undefined
  readonly optionalDependencies?: Readonly<Record<string, string>> | undefined
}

export interface WorkingPackageJson {
  readonly packageJsonPath: string
  readonly packageJson: INodePackageJson
}

export interface PackageIndex {
  readonly workingPackageBySourceFile: HashMap.HashMap<string, Option.Option<WorkingPackageJson>>
  readonly tsdocMetadataPaths: HashSet.HashSet<string>
}

export const PackageIndex = {
  empty: (): PackageIndex => ({
    workingPackageBySourceFile: HashMap.empty(),
    tsdocMetadataPaths: HashSet.empty(),
  }),

  withSourceFile: (
    index: PackageIndex,
    sourceFilePath: string,
    workingPackage: Option.Option<WorkingPackageJson>,
  ): PackageIndex => ({
    ...index,
    workingPackageBySourceFile: HashMap.set(index.workingPackageBySourceFile, sourceFilePath, workingPackage),
  }),

  forSourceFile: (index: PackageIndex, sourceFilePath: string): Option.Option<WorkingPackageJson> =>
    Option.flatMap(HashMap.get(index.workingPackageBySourceFile, sourceFilePath), (workingPackage) => workingPackage),

  withTsdocMetadataPath: (index: PackageIndex, tsdocMetadataPath: string): PackageIndex => ({
    ...index,
    tsdocMetadataPaths: HashSet.add(index.tsdocMetadataPaths, tsdocMetadataPath),
  }),

  hasTsdocMetadataPath: (index: PackageIndex, tsdocMetadataPath: string): boolean =>
    HashSet.has(index.tsdocMetadataPaths, tsdocMetadataPath),
} as const

const isStringValue = (value: Json | undefined): value is string => typeof value === 'string'

const isNonNullObject = (value: Json | undefined): value is { readonly [key: string]: Json } =>
  Match.value({
    defined: value !== undefined,
    nonNull: value !== null,
    object: typeof value === 'object',
    list: Array.isArray(value),
  }).pipe(
    Match.when({ defined: true, nonNull: true, object: true, list: false }, () => true),
    Match.orElse(() => false),
  )

const isStringRecord = (value: Json | undefined): value is Readonly<Record<string, string>> =>
  isNonNullObject(value) && Object.values(value).every((entry) => typeof entry === 'string')

const readOptionalString = (record: JsonRecord, key: string): string | undefined =>
  Option.getOrUndefined(Option.filter(Option.some(record[key]), isStringValue))

const readOptionalJson = (record: JsonRecord, key: string): Json | undefined => record[key]

const readOptionalStringRecord = (
  record: JsonRecord,
  key: string,
): Readonly<Record<string, string>> | undefined =>
  Option.getOrUndefined(Option.filter(Option.some(record[key]), isStringRecord))

/**
 * The fields PackageJsonLookup makes available to the analyzer. Every field the metadata
 * resolver, the bundled-package resolver, and the enhancers read must survive the decode: an
 * `exports`- or `typesVersions`-shaped package would otherwise resolve its tsdoc-metadata path
 * and its bundled dependency names differently from upstream.
 */
export const decodeNodePackageJsonRecord = (raw: JsonRecord): INodePackageJson => ({
  name: readOptionalString(raw, 'name'),
  version: readOptionalString(raw, 'version'),
  main: readOptionalString(raw, 'main'),
  types: readOptionalString(raw, 'types'),
  typings: readOptionalString(raw, 'typings'),
  tsdocMetadata: readOptionalString(raw, 'tsdocMetadata'),
  exports: readOptionalJson(raw, 'exports'),
  typesVersions: readOptionalJson(raw, 'typesVersions'),
  dependencies: readOptionalStringRecord(raw, 'dependencies'),
  devDependencies: readOptionalStringRecord(raw, 'devDependencies'),
  peerDependencies: readOptionalStringRecord(raw, 'peerDependencies'),
  optionalDependencies: readOptionalStringRecord(raw, 'optionalDependencies'),
})

export const decodeNodePackageJson = (
  content: string,
): Result.Result<INodePackageJson, Schema.SchemaError> =>
  Result.map(Schema.decodeResult(JsonRecordFromString)(content), decodeNodePackageJsonRecord)
