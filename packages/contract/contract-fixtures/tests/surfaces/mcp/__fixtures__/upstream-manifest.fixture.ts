import { Option, Schema } from 'effect'

export interface InPlaceTestCase {
  readonly path: string
  readonly scenarios: ReadonlyArray<string>
}

export interface InPlaceRecord {
  readonly root: string
  readonly commit: string
  readonly tests: ReadonlyArray<InPlaceTestCase>
}

export interface UpstreamManifest {
  readonly 'in-place': ReadonlyArray<InPlaceRecord>
}

const InPlaceTestCaseSchema = Schema.Struct({
  path: Schema.String,
  scenarios: Schema.Array(Schema.String),
})

const InPlaceRecordSchema = Schema.Struct({
  root: Schema.String,
  commit: Schema.String,
  tests: Schema.Array(InPlaceTestCaseSchema),
})

const UpstreamManifestSchema = Schema.Struct({
  'in-place': Schema.Array(InPlaceRecordSchema),
})

export const decodeUpstreamManifest = (text: string): Option.Option<UpstreamManifest> =>
  Schema.decodeUnknownOption(UpstreamManifestSchema)(JSON.parse(text))

export const scenarioFiles = (manifest: UpstreamManifest): ReadonlyMap<string, string> =>
  new Map(
    manifest['in-place'].flatMap((record) =>
      record.tests.flatMap((test) =>
        test.scenarios.map((scenario): readonly [string, string] => [scenario, `${record.root}/${test.path}`])
      )
    ),
  )
