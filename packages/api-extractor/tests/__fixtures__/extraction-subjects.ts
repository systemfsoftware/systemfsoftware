import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'

import { readFixtureFile, type FixtureFailure } from './extractor-harness.js'
import type { ExtractedPackage, RenderedArtifacts } from './rendered-reports.schema.js'
import { seededFixture, type SeededFixture } from './seeded-fixture.js'

export interface PlannedArtifact {
  readonly path: string
  readonly golden: string
}

export interface ExtractionPlan<F extends string = ExtractedPackage> {
  readonly fixture: F
  readonly decision: string
  readonly diagnostics?: boolean
  readonly artifacts: ReadonlyArray<PlannedArtifact>
}

export interface ExtractionSubject {
  readonly seeded: SeededFixture
  readonly promised: RenderedArtifacts
}

export const normalizedText = (text: string): string => text.replaceAll('\r\n', '\n')

export const AMBIENT_ALIAS: ExtractionPlan<'ambient-alias'> = {
  fixture: 'ambient-alias',
  decision: 'passed',
  artifacts: [{ path: 'temp/ambient-alias.api.md', golden: 'etc/ambient-alias.api.md' }],
}

export const ANALYZER: ExtractionPlan<'analyzer'> = {
  fixture: 'analyzer',
  decision: 'failed',
  artifacts: [{ path: 'temp/analyzer-fixture.api.md', golden: 'expected/analyzer-fixture.api.md' }],
}

export const EXTERNAL_API: ExtractionPlan<'external-api'> = {
  fixture: 'external-api',
  decision: 'failed',
  artifacts: [{ path: 'temp/external-api.api.md', golden: 'etc/external-api.api.md' }],
}

export const EXTERNAL_STAR: ExtractionPlan<'external-star'> = {
  fixture: 'external-star',
  decision: 'failed',
  artifacts: [{ path: 'temp/external-star.api.md', golden: 'etc/external-star.api.md' }],
}

export const GLOBAL_REFERENCE: ExtractionPlan<'global-reference'> = {
  fixture: 'global-reference',
  decision: 'failed',
  diagnostics: true,
  artifacts: [{ path: 'temp/global-reference.api.md', golden: 'etc/global-reference.api.md' }],
}

export const NODE_AMBIENT: ExtractionPlan<'node-ambient'> = {
  fixture: 'node-ambient',
  decision: 'failed',
  artifacts: [{ path: 'temp/node-ambient.api.md', golden: 'etc/node-ambient.api.md' }],
}

export const VALUE_IMPORT_TYPE: ExtractionPlan<'value-import-type'> = {
  fixture: 'value-import-type',
  decision: 'passed',
  artifacts: [{ path: 'temp/value-import-type.api.md', golden: 'etc/value-import-type.api.md' }],
}

export const REPORT_PARITY: ExtractionPlan<'report-parity/simple-pkg'> = {
  fixture: 'report-parity/simple-pkg',
  decision: 'passed',
  artifacts: [
    { path: 'temp/simple-pkg.api.md', golden: 'etc/simple-pkg.api.md' },
    { path: 'temp/simple-pkg.public.api.md', golden: 'etc/simple-pkg.public.api.md' },
    { path: 'temp/simple-pkg.beta.api.md', golden: 'etc/simple-pkg.beta.api.md' },
  ],
}

export const ROLLUP_AE3: ExtractionPlan<'rollup/ae3'> = {
  fixture: 'rollup/ae3',
  decision: 'passed',
  artifacts: [{ path: 'dist/ae3.d.ts', golden: 'expected/ae3.d.ts' }],
}

export const ROLLUP_NESTED: ExtractionPlan<'rollup/nested'> = {
  fixture: 'rollup/nested',
  decision: 'passed',
  artifacts: [{ path: 'dist/nested.d.ts', golden: 'expected/nested.d.ts' }],
}

export const ROLLUP_STAR: ExtractionPlan<'rollup/star'> = {
  fixture: 'rollup/star',
  decision: 'passed',
  artifacts: [{ path: 'dist/star.d.ts', golden: 'expected/star.d.ts' }],
}

export const CLEAN_PACKAGE: ExtractionPlan<'extractor-flow/simple-pkg'> = {
  fixture: 'extractor-flow/simple-pkg',
  decision: 'passed',
  artifacts: [{ path: 'temp/simple-pkg.api.md', golden: 'etc/simple-pkg.api.md' }],
}

export const DRIFTED_PACKAGE: ExtractionPlan<'extractor-flow/simple-pkg-drifted'> = {
  fixture: 'extractor-flow/simple-pkg-drifted',
  decision: 'failed',
  artifacts: [],
}

export const extractionSubjectOf = (
  plan: ExtractionPlan,
): Effect.Effect<ExtractionSubject, FixtureFailure, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const seeded = yield* seededFixture(plan.fixture)
    const artifacts = yield* Effect.forEach(plan.artifacts, (artifact) =>
      Effect.map(readFixtureFile({ fixture: plan.fixture, relativePath: artifact.golden }), (text) => ({
        path: artifact.path,
        text: normalizedText(text),
      })))
    return { seeded, promised: { decision: plan.decision, artifacts } }
  })