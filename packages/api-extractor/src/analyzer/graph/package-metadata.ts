import * as Arr from 'effect/Array'
import * as Data from 'effect/Data'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import type { Json } from 'effect/Schema'
import * as semver from 'semver'

import * as path from '../path-helpers.js'
import type { INodePackageJson } from './package-index.js'

export const TSDOC_METADATA_FILENAME = 'tsdoc-metadata.json'

export interface PackageMetadataFields {
  readonly packageJsonPath: string
  readonly packageJson: INodePackageJson
  readonly aedocSupported: boolean
}

export class PackageMetadata extends Data.Class<PackageMetadataFields> {}

type JsonRecordValue = { readonly [key: string]: Json }

const isNonNullObject = (value: Json): boolean => value !== null && typeof value === 'object'

const isJsonRecord = (value: Json | undefined): value is JsonRecordValue =>
  Match.value(value).pipe(
    Match.when(
      (candidate: Json) => isNonNullObject(candidate) && !Array.isArray(candidate),
      () => true,
    ),
    Match.orElse(() => false),
  )

const isStringJson = (value: Json | undefined): value is string => typeof value === 'string'

const isArrayJson = (value: Json | undefined): value is readonly Json[] => Array.isArray(value)

const isDefinedString = (value: string | undefined): value is string => value !== undefined

const metadataPathUnder = (entryPath: string): string => `${path.dirname(entryPath)}/${TSDOC_METADATA_FILENAME}`

const firstStringOf = (values: readonly Json[]): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(values[0]), isStringJson)

const stringEntriesOf = (values: readonly Json[]): readonly string[] => Arr.filter(values, isStringJson)

const typesExportFolderPath = (typesExport: Json | undefined): string | undefined =>
  Option.match(Option.filter(Option.some(typesExport), isStringJson), {
    onSome: metadataPathUnder,
    onNone: () =>
      Option.match(Option.filter(Option.some(typesExport), isJsonRecord), {
        onSome: (record) => typesExportFolderPath(record['types']),
        onNone: () => undefined,
      }),
  })

const pathEntryOf = (entry: Json | undefined): readonly string[] | undefined =>
  Option.match(Option.filter(Option.some(entry), isStringJson), {
    onSome: (text) => [text],
    onNone: () =>
      Option.match(Option.filter(Option.some(entry), isArrayJson), {
        onSome: stringEntriesOf,
        onNone: () => undefined,
      }),
  })

const rootExportMetadataPath = (record: JsonRecordValue): string | undefined => {
  const rootExport: Json | undefined = record['.'] ?? record['*']
  return Option.match(Option.filter(Option.some(rootExport), isStringJson), {
    onSome: metadataPathUnder,
    onNone: () =>
      Option.match(Option.filter(Option.some(rootExport), isJsonRecord), {
        onSome: (nested) => typesExportFolderPath(nested['types']),
        onNone: () => undefined,
      }),
  })
}

const exportsMetadataPath = (exports: Json | undefined): string | undefined =>
  Option.match(Option.filter(Option.some(exports), isStringJson), {
    onSome: metadataPathUnder,
    onNone: () =>
      Option.match(Option.filter(Option.some(exports), isArrayJson), {
        onSome: (values) =>
          Option.match(firstStringOf(values), {
            onSome: metadataPathUnder,
            onNone: () => undefined,
          }),
        onNone: () =>
          Option.match(Option.filter(Option.some(exports), isJsonRecord), {
            onSome: rootExportMetadataPath,
            onNone: () => undefined,
          }),
      }),
  })

interface TypesVersionScan {
  readonly highestMinimum: Option.Option<semver.SemVer>
  readonly latestPath: Option.Option<string>
}

const minimumVersionOf = (version: string): Option.Option<semver.SemVer> =>
  Option.fromNullishOr(semver.validRange(version)).pipe(
    Option.flatMap((range) => Option.fromNullishOr(semver.minVersion(range))),
  )

const typesVersionEntryOf = (paths: Json | undefined): readonly string[] | undefined =>
  Option.match(Option.filter(Option.some(paths), isArrayJson), {
    onSome: stringEntriesOf,
    onNone: () =>
      Option.match(Option.filter(Option.some(paths), isStringJson), {
        onSome: (text) => [text],
        onNone: () =>
          Option.match(Option.filter(Option.some(paths), isJsonRecord), {
            onSome: (record) => pathEntryOf(record['.'] ?? record['*']),
            onNone: () => undefined,
          }),
      }),
  })

const acceptScan = (accumulated: TypesVersionScan, minimum: semver.SemVer, paths: Json): TypesVersionScan =>
  Option.match(Option.flatMap(Option.fromNullishOr(typesVersionEntryOf(paths)), Arr.head), {
    onSome: (firstPath) => ({ highestMinimum: Option.some(minimum), latestPath: Option.some(firstPath) }),
    onNone: () => accumulated,
  })

const newerScan = (accumulated: TypesVersionScan, version: string, paths: Json): TypesVersionScan =>
  Option.match(minimumVersionOf(version), {
    onNone: () => accumulated,
    onSome: (minimum) =>
      Option.match(accumulated.highestMinimum, {
        onNone: () => acceptScan(accumulated, minimum, paths),
        onSome: (highest) =>
          Match.value(semver.gt(minimum, highest)).pipe(
            Match.when(true, () => acceptScan(accumulated, minimum, paths)),
            Match.when(false, () => accumulated),
            Match.exhaustive,
          ),
      }),
  })

const typesVersionsMetadataPath = (packageJson: INodePackageJson): string | undefined =>
  Option.match(Option.filter(Option.some(packageJson.typesVersions), isJsonRecord), {
    onSome: (record) => {
      const scan = Arr.reduce(
        Object.entries(record),
        {
          highestMinimum: Option.none<semver.SemVer>(),
          latestPath: Option.none<string>(),
        } satisfies TypesVersionScan,
        (accumulated, [version, paths]) => newerScan(accumulated, version, paths),
      )
      return Option.getOrUndefined(scan.latestPath)
    },
    onNone: () => undefined,
  })

const typesOrTypingsMetadataPath = (packageJson: INodePackageJson): string | undefined =>
  Option.match(Option.filter(Option.some(packageJson.types ?? packageJson.typings), isStringJson), {
    onSome: metadataPathUnder,
    onNone: () => undefined,
  })

const mainMetadataPath = (packageJson: INodePackageJson): string | undefined =>
  Option.match(Option.filter(Option.some(packageJson.main), isStringJson), {
    onSome: metadataPathUnder,
    onNone: () => undefined,
  })

const firstDefined = (candidates: readonly (string | undefined)[]): Option.Option<string> =>
  Arr.findFirst(candidates, isDefinedString)

const tsdocMetadataRelativePathOf = (packageJson: INodePackageJson): string =>
  Option.getOrElse(
    firstDefined([
      packageJson.tsdocMetadata,
      exportsMetadataPath(packageJson.exports),
      typesVersionsMetadataPath(packageJson),
      typesOrTypingsMetadataPath(packageJson),
      mainMetadataPath(packageJson),
    ]),
    () => TSDOC_METADATA_FILENAME,
  )

export const resolveTsdocMetadataPath = (
  packageFolder: string,
  packageJson: INodePackageJson,
  tsdocMetadataPath?: string,
): string =>
  Option.match(Option.fromNullishOr(tsdocMetadataPath), {
    onSome: (explicit) => path.resolve(packageFolder, explicit),
    onNone: () => path.resolve(packageFolder, tsdocMetadataRelativePathOf(packageJson)),
  })

export const makePackageMetadata = (
  packageJsonPath: string,
  packageJson: INodePackageJson,
  aedocSupported: boolean,
): PackageMetadata => new PackageMetadata({ packageJsonPath, packageJson, aedocSupported })
