import { HashMap, HashSet, Option, Schema } from 'effect'
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

const readOptionalString = (record: JsonRecord, key: string): string | undefined =>
  Option.getOrUndefined(Option.filter(Option.some(record[key]), isStringValue))

export const decodeNodePackageJson = (
  content: string,
): Result.Result<INodePackageJson, Schema.SchemaError> =>
  Result.map(Schema.decodeResult(JsonRecordFromString)(content), (raw: JsonRecord) => ({
    name: readOptionalString(raw, 'name'),
    version: readOptionalString(raw, 'version'),
    main: readOptionalString(raw, 'main'),
    types: readOptionalString(raw, 'types'),
    typings: readOptionalString(raw, 'typings'),
    tsdocMetadata: readOptionalString(raw, 'tsdocMetadata'),
  }))
