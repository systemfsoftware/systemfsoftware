import { Differential } from '@systemfsoftware/differential-spec'
import * as fc from 'fast-check'

import { generatedDeclarationPackage } from './__fixtures__/declaration-package.fixture.js'
import type { EmittedFile, SideArtifacts } from './__fixtures__/parity/parity-harness.fixture.js'
import {
  bareExtendsPackage,
  bundledPackagesPackage,
  engineArtifacts,
  parityCorpus,
  upstreamArtifacts,
} from './__fixtures__/parity/parity-harness.fixture.js'

const normalizeTsdocMetadata = (file: EmittedFile): string =>
  file.path.endsWith('tsdoc-metadata.json')
    ? file.contents
      .replace(/("packageName":\s*)"[^"]*"/, '$1"<tool>"')
      .replace(/("packageVersion":\s*)"[^"]*"/, '$1"<version>"')
    : file.contents

const canonical = (files: ReadonlyArray<EmittedFile>): string =>
  JSON.stringify(files.map((file) => [file.path, normalizeTsdocMetadata(file)]))

const sameExtraction = (upstream: SideArtifacts, engine: SideArtifacts): boolean =>
  upstream.failure !== 'none' || engine.failure !== 'none'
    ? upstream.failure === engine.failure
    : upstream.succeeded === engine.succeeded && canonical(upstream.emitted) === canonical(engine.emitted)

const corpusOptions = {
  runBudget: 1,
  hostBound: {
    timeout: 120_000,
    reason: 'each side compiles a declaration package with the host TypeScript compiler and runs the extractor over it',
  },
}

const generatedOptions = {
  runBudget: 8,
  hostBound: {
    timeout: 600_000,
    reason: 'each side compiles a generated declaration package with the host TypeScript compiler',
  },
}

parityCorpus.forEach((fixture) => {
  Differential.compare({
    name: `the engine matches upstream on the ${fixture.name} fixture`,
    reference: upstreamArtifacts,
    candidate: engineArtifacts,
  })
    .on(fc.constant(fixture), corpusOptions)
    .assert(sameExtraction)
})

Differential.compare({
  name: 'the engine matches upstream on a configuration that extends a base config by package name',
  reference: upstreamArtifacts,
  candidate: engineArtifacts,
})
  .on(fc.constant(bareExtendsPackage), corpusOptions)
  .assert(sameExtraction)

Differential.compare({
  name: 'the engine matches upstream on a rollup that bundles a dependency package',
  reference: upstreamArtifacts,
  candidate: engineArtifacts,
})
  .on(fc.constant(bundledPackagesPackage), corpusOptions)
  .assert(sameExtraction)

Differential.compare({
  name: 'the engine matches upstream on generated declaration packages',
  reference: upstreamArtifacts,
  candidate: engineArtifacts,
})
  .on(generatedDeclarationPackage, generatedOptions)
  .assert(sameExtraction)
