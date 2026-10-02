import { Differential } from '@systemfsoftware/differential-spec'
import * as fc from 'fast-check'

import { generatedDeclarationPackage } from './__fixtures__/declaration-package.fixture.js'
import type {
  ConsoleSide,
  EmittedFile,
  EngineArtifacts,
  GoldenFixture,
  SideArtifacts,
} from './__fixtures__/parity/parity-harness.fixture.js'
import {
  bareExtendsPackage,
  bundledPackagesPackage,
  engineArtifacts,
  goldenFixtures,
  mintGolden,
  mintRequested,
  normalizeEmitted,
  parityCorpus,
  upstreamArtifacts,
} from './__fixtures__/parity/parity-harness.fixture.js'

const canonical = (files: ReadonlyArray<{ readonly path: string; readonly contents: string }>): string =>
  JSON.stringify(normalizeEmitted(files))

const cliOnlyAnnouncementMarkers = [
  'https://api-extractor.com/',
  'Using configuration from ',
  'API Extractor completed ',
]

const escapeCharacter = String.fromCharCode(27)
const ansiParameters = /^\[[0-9;]*m/

const withoutAnsi = (text: string): string =>
  text
    .split(escapeCharacter)
    .map((segment) => segment.replace(ansiParameters, ''))
    .join('')

const isCliOnlyLine = (line: string): boolean => {
  const plain = withoutAnsi(line).trim()
  return plain === '' || cliOnlyAnnouncementMarkers.some((marker) => plain.includes(marker))
}

const withoutCliOnlyLines = (text: string): string =>
  text
    .split('\n')
    .filter((line) => !isCliOnlyLine(line))
    .join('\n')

const messageSurface = (side: ConsoleSide): ConsoleSide => ({
  stdout: withoutCliOnlyLines(side.stdout),
  stderr: withoutCliOnlyLines(side.stderr),
})

const consoleMatches = (upstream: SideArtifacts, engine: SideArtifacts): boolean =>
  messageSurface(upstream.console).stdout === messageSurface(engine.console).stdout &&
  messageSurface(upstream.console).stderr === messageSurface(engine.console).stderr

const sameFailureClass = (upstream: SideArtifacts, engine: EngineArtifacts): boolean =>
  upstream.failure === engine.failure

const sameInvokedExtraction = (upstream: SideArtifacts, engine: EngineArtifacts): boolean =>
  upstream.succeeded === engine.succeeded &&
  canonical(upstream.emitted) === canonical(engine.emitted) &&
  consoleMatches(upstream, engine) &&
  (engine.golden === undefined || engine.golden.matches)

const sameExtraction = (upstream: SideArtifacts, engine: EngineArtifacts): boolean =>
  upstream.failure !== 'none' || engine.failure !== 'none'
    ? sameFailureClass(upstream, engine)
    : sameInvokedExtraction(upstream, engine)

const corpusOptions = {
  runBudget: 1,
  hostBound: {
    timeout: 120_000,
    reason: 'each side compiles a declaration package with the host TypeScript compiler and runs the extractor over it',
  },
}

const generatedOptions = {
  runBudget: 50,
  hostBound: {
    timeout: 1_200_000,
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

if (mintRequested) {
  goldenFixtures.forEach((fixture) => {
    Differential.compare({
      name: `the golden mint reproduces the pinned upstream bytes for the ${fixture.name} fixture`,
      reference: (known: GoldenFixture) => upstreamArtifacts(known.pkg),
      candidate: (known: GoldenFixture) => mintGolden(known),
    })
      .on(fc.constant(fixture), corpusOptions)
      .assert((upstream: SideArtifacts, recorded: ReadonlyArray<EmittedFile>) =>
        canonical(upstream.emitted) === canonical(recorded)
      )
  })
}
