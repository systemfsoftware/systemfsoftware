import { HashMap, HashSet, Option, Schema } from 'effect'
import * as Result from 'effect/Result'

import { NodePackageJsonFromString, type PackageJson } from './package-json.schema.js'

/**
 * The manifest fields the analyzer resolves against. It is the decoded side of npm's
 * `package.json` (see `package-json.schema.ts`): `exports` and `typesVersions` are the forms the
 * metadata resolver distinguishes, never the raw JSON.
 */
export type INodePackageJson = PackageJson

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

/** Decodes a `package.json` document into the manifest the analyzer reads. */
export const decodeNodePackageJson = (content: string): Result.Result<INodePackageJson, Schema.SchemaError> =>
  Schema.decodeResult(NodePackageJsonFromString)(content)
