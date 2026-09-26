import * as Arr from 'effect/Array'
import * as Data from 'effect/Data'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Record from 'effect/Record'
import * as semver from 'semver'

import * as path from '../path-helpers.js'
import type { INodePackageJson } from './package-index.js'
import type { ManifestMap, ManifestValue } from './package-json.schema.js'

export const TSDOC_METADATA_FILENAME = 'tsdoc-metadata.json'

export interface PackageMetadataFields {
  readonly packageJsonPath: string
  readonly packageJson: INodePackageJson
  readonly aedocSupported: boolean
}

export class PackageMetadata extends Data.Class<PackageMetadataFields> {}

const metadataPathUnder = (entryPath: string): string => `${path.dirname(entryPath)}/${TSDOC_METADATA_FILENAME}`

/** A field form's text, when it is the text form. */
const textEntryOf = (value: ManifestValue): Option.Option<string> =>
  Match.value(value).pipe(
    Match.discriminator('kind')('ManifestText', (text) => Option.some(text.text)),
    Match.orElse(() => Option.none()),
  )

/** The first entry's text, when it is text: upstream reads only index 0 of a fallback list. */
const firstEntryTextOf = (entries: ReadonlyArray<ManifestValue>): Option.Option<string> =>
  Option.flatMap(Arr.head(entries), textEntryOf)

/** The first text anywhere in a fallback list: upstream filters the list for strings. */
const firstTextElementOf = (entries: ReadonlyArray<ManifestValue>): Option.Option<string> =>
  Arr.head(Arr.getSomes(Arr.map(entries, textEntryOf)))

/** A map value's `.` or `*` entry as text or a fallback list: upstream's `pathEntryOf`. */
const rootEntryTextOf = (map: ManifestMap): Option.Option<string> =>
  Option.flatMap(rootEntryOf(map), (entry) =>
    Match.value(entry).pipe(
      Match.discriminator('kind')('ManifestText', (text) => Option.some(text.text)),
      Match.discriminator('kind')('ManifestSequence', (sequence) => firstTextElementOf(sequence.entries)),
      Match.orElse(() => Option.none()),
    ))

const rootEntryOf = (map: ManifestMap): Option.Option<ManifestValue> =>
  Option.orElse(Record.get(map.entries, '.'), () => Record.get(map.entries, '*'))

/** Upstream's `typesExportFolderPath`: the `types` entry of an export map, however deep. */
const typesExportFolderPathOf = (value: Option.Option<ManifestValue>): Option.Option<string> =>
  Option.flatMap(value, (entry) =>
    Match.value(entry).pipe(
      Match.discriminator('kind')('ManifestText', (text) => Option.some(metadataPathUnder(text.text))),
      Match.discriminator('kind')('ManifestMap', (nested) =>
        typesExportFolderPathOf(Record.get(nested.entries, 'types'))),
      Match.orElse(() =>
        Option.none()
      ),
    ))

/** Upstream's `rootExportMetadataPath`: an export map's `.` or `*` entry. */
const rootExportMetadataPathOf = (map: ManifestMap): Option.Option<string> =>
  Option.flatMap(rootEntryOf(map), (entry) =>
    Match.value(entry).pipe(
      Match.discriminator('kind')('ManifestText', (text) => Option.some(metadataPathUnder(text.text))),
      Match.discriminator('kind')('ManifestMap', (nested) =>
        typesExportFolderPathOf(Record.get(nested.entries, 'types'))),
      Match.orElse(() =>
        Option.none()
      ),
    ))

/** Upstream's `exportsMetadataPath`: a string, a fallback list's first entry, or an export map. */
const exportsMetadataPathOf = (exports: ManifestValue | undefined): Option.Option<string> =>
  Option.flatMap(Option.fromNullishOr(exports), (value) =>
    Match.value(value).pipe(
      Match.discriminator('kind')('ManifestText', (text) => Option.some(metadataPathUnder(text.text))),
      Match.discriminator('kind')('ManifestSequence', (sequence) =>
        Option.map(firstEntryTextOf(sequence.entries), metadataPathUnder)),
      Match.discriminator('kind')('ManifestMap', rootExportMetadataPathOf),
      Match.orElse(() =>
        Option.none()
      ),
    ))

/** Upstream's `typesVersionEntryOf`: a path, a list of paths, or a `.`/`*` map of them. */
const typesVersionEntryTextOf = (paths: ManifestValue): Option.Option<string> =>
  Match.value(paths).pipe(
    Match.discriminator('kind')('ManifestText', (text) => Option.some(text.text)),
    Match.discriminator('kind')('ManifestSequence', (sequence) => firstTextElementOf(sequence.entries)),
    Match.discriminator('kind')('ManifestMap', rootEntryTextOf),
    Match.orElse(() => Option.none()),
  )

interface TypesVersionScan {
  readonly highestMinimum: Option.Option<semver.SemVer>
  readonly latestPath: Option.Option<string>
}

const minimumVersionOf = (version: string): Option.Option<semver.SemVer> =>
  Option.fromNullishOr(semver.validRange(version)).pipe(
    Option.flatMap((range) => Option.fromNullishOr(semver.minVersion(range))),
  )

const acceptScan = (accumulated: TypesVersionScan, minimum: semver.SemVer, paths: ManifestValue): TypesVersionScan =>
  Option.match(typesVersionEntryTextOf(paths), {
    onSome: (firstPath) => ({ highestMinimum: Option.some(minimum), latestPath: Option.some(firstPath) }),
    onNone: () => accumulated,
  })

const newerScan = (accumulated: TypesVersionScan, version: string, paths: ManifestValue): TypesVersionScan =>
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

const scanOf = (map: ManifestMap): TypesVersionScan =>
  Arr.reduce(
    Record.toEntries(map.entries),
    {
      highestMinimum: Option.none<semver.SemVer>(),
      latestPath: Option.none<string>(),
    } satisfies TypesVersionScan,
    (accumulated, [version, paths]) => newerScan(accumulated, version, paths),
  )

/** Upstream's `typesVersionsMetadataPath`: the entry with the newest satisfying minimum version. */
const typesVersionsMetadataPathOf = (packageJson: INodePackageJson): Option.Option<string> =>
  Option.flatMap(Option.fromNullishOr(packageJson.typesVersions), (value) =>
    Match.value(value).pipe(
      Match.discriminator('kind')('ManifestMap', (map) => scanOf(map).latestPath),
      Match.orElse(() => Option.none()),
    ))

const typesOrTypingsMetadataPathOf = (packageJson: INodePackageJson): Option.Option<string> =>
  Option.map(Option.fromNullishOr(packageJson.types ?? packageJson.typings), metadataPathUnder)

const mainMetadataPathOf = (packageJson: INodePackageJson): Option.Option<string> =>
  Option.map(Option.fromNullishOr(packageJson.main), metadataPathUnder)

const tsdocMetadataRelativePathOf = (packageJson: INodePackageJson): string =>
  Option.getOrElse(
    Option.firstSomeOf([
      Option.fromNullishOr(packageJson.tsdocMetadata),
      exportsMetadataPathOf(packageJson.exports),
      typesVersionsMetadataPathOf(packageJson),
      typesOrTypingsMetadataPathOf(packageJson),
      mainMetadataPathOf(packageJson),
    ]),
    () => TSDOC_METADATA_FILENAME,
  )

export const resolveTsdocMetadataPath = dual<
  (packageJson: INodePackageJson, tsdocMetadataPath?: string) => (packageFolder: string) => string,
  (packageFolder: string, packageJson: INodePackageJson, tsdocMetadataPath?: string) => string
>(
  (args) => typeof args[0] === 'string',
  (packageFolder, packageJson, tsdocMetadataPath): string =>
    Option.match(Option.fromNullishOr(tsdocMetadataPath), {
      onSome: (explicit) => path.resolve(packageFolder, explicit),
      onNone: () => path.resolve(packageFolder, tsdocMetadataRelativePathOf(packageJson)),
    }),
)

export const makePackageMetadata = dual<
  (packageJson: INodePackageJson, aedocSupported: boolean) => (packageJsonPath: string) => PackageMetadata,
  (packageJsonPath: string, packageJson: INodePackageJson, aedocSupported: boolean) => PackageMetadata
>(3, (
  packageJsonPath: string,
  packageJson: INodePackageJson,
  aedocSupported: boolean,
): PackageMetadata => new PackageMetadata({ packageJsonPath, packageJson, aedocSupported }))

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this branch is
  // statically dead in the build and a static import would publish the test-only dependency.
  const { it } = await import('@systemfsoftware/vitest')
  const { Schema: S } = await import('effect')
  const { ManifestValue } = await import('./package-json.schema.js')

  const MetadataFieldPackage = S.Struct({
    tsdocMetadata: S.String,
    exports: S.optionalKey(ManifestValue),
    typesVersions: S.optionalKey(ManifestValue),
    types: S.optionalKey(S.String),
    typings: S.optionalKey(S.String),
    main: S.optionalKey(S.String),
  })

  const NonMetadataFieldPackage = S.Struct({
    name: S.optionalKey(S.String),
    version: S.optionalKey(S.String),
  })

  it.prop(
    '∀p_TsdocMetadataField_≡ResolvedMetadataField',
    { of: [S.String, MetadataFieldPackage], subject: resolveTsdocMetadataPath },
    (subject, [packageFolder, packageJson]) =>
      subject(packageFolder, packageJson) === path.resolve(packageFolder, packageJson.tsdocMetadata),
  )

  it.prop(
    '∀p_ExplicitMetadataPath_≡ResolvedExplicitPath',
    { of: [S.String, S.String, MetadataFieldPackage], subject: resolveTsdocMetadataPath },
    (subject, [packageFolder, explicit, packageJson]) =>
      subject(packageFolder, packageJson, explicit) === path.resolve(packageFolder, explicit),
  )

  it.prop(
    '∀p_NoMetadataFields_≡RootMetadataFile',
    { of: [S.String, NonMetadataFieldPackage], subject: resolveTsdocMetadataPath },
    (subject, [packageFolder, packageJson]) =>
      subject(packageFolder, packageJson) ===
        path.resolve(packageFolder, TSDOC_METADATA_FILENAME),
  )
}
