import * as NodeServices from '@effect/platform-node/NodeServices'
import { Extractor } from '@systemfsoftware/api-extractor'
import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Schema from 'effect/Schema'

import {
  AMBIENT_ALIAS,
  ANALYZER,
  CLEAN_PACKAGE,
  DRIFTED_PACKAGE,
  EXTERNAL_API,
  EXTERNAL_STAR,
  type ExtractionPlan,
  extractionSubjectOf,
  GLOBAL_REFERENCE,
  NODE_AMBIENT,
  normalizedText,
  REPORT_PARITY,
  ROLLUP_AE3,
  ROLLUP_NESTED,
  ROLLUP_STAR,
  VALUE_IMPORT_TYPE,
} from './__fixtures__/extraction-subjects.js'
import {
  ExpectedArtifacts,
  type ExtractedPackage,
  type RenderedArtifacts,
} from './__fixtures__/rendered-reports.schema.js'
import type { SeededFixture } from './__fixtures__/seeded-fixture.js'

const Feature = makeFeature({ it })

const decisionNameOf = (decision: Extractor.ExtractionDecision): string =>
  Match.value(decision).pipe(
    Match.tagsExhaustive({ ExtractionFailed: () => 'failed', ExtractionPassed: () => 'passed' }),
  )

const sunk = (lines: string[]): Extractor.TextWritable => ({
  write: (text) => {
    lines.push(text)
  },
})

const extractionOf = (seeded: SeededFixture, plan: ExtractionPlan) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const options = plan.diagnostics === true ? { cliFlags: { diagnostics: true } } : {}
    const decision = yield* Extractor.run({ configFilePath: seeded.configPath, options })
    const artifacts = yield* Effect.forEach(plan.artifacts, (artifact) =>
      Effect.map(fs.readFileString(path.join(seeded.root, artifact.path)), (text) => ({
        path: artifact.path,
        text: normalizedText(text),
      })))
    return { decision: decisionNameOf(decision), artifacts }
  })

const subjectOf = (seeded: SeededFixture) =>
  Layer.mergeAll(seeded.layer, Path.layer, Extractor.layer({ stdout: sunk([]), stderr: sunk([]) }))

const observedArtifactsOf = <C>(report: Conformance.Report<C, RenderedArtifacts>): ReadonlyArray<RenderedArtifacts> =>
  Match.value(report).pipe(
    Match.tag('Fail', (fail) => {
      const [first] = fail.failure.operations
      return Option.toArray(Option.flatMap(Option.fromNullishOr(first?.response), (response) => Option.some(response)))
    }),
    Match.orElse(() => []),
  )

const firstDifferenceOf = (expected: string, observed: string): number => {
  const reach = Math.min(expected.length, observed.length)
  return Option.getOrElse(
    Arr.findFirstIndex(Arr.makeBy(reach + 1, (index) => index), (index) => expected[index] !== observed[index]),
    () => reach,
  )
}

const divergenceOf = (promised: RenderedArtifacts, observed: ReadonlyArray<RenderedArtifacts>): string => {
  const written = observed.flatMap((response) => response.artifacts)
  const decision = observed[0]?.decision ?? 'nothing'
  const missing = promised.artifacts.filter((wanted) => !written.some((artifact) => artifact.path === wanted.path))
  const differing = promised.artifacts.filter((wanted) => {
    const found = written.find((artifact) => artifact.path === wanted.path)
    return found !== undefined && found.text !== wanted.text
  })
  const firstDiff = differing[0]
  const found = firstDiff === undefined ? undefined : written.find((artifact) => artifact.path === firstDiff.path)
  if (firstDiff !== undefined && found !== undefined) {
    const at = firstDifferenceOf(firstDiff.text, found.text)
    return `the run wrote a different artifact at ${firstDiff.path} (expected ${firstDiff.text.length} characters, ` +
      `observed ${found.text.length}, first difference at ${at}): expected ${
        JSON.stringify(firstDiff.text.slice(Math.max(0, at - 40), at + 60))
      } observed ${JSON.stringify(found.text.slice(Math.max(0, at - 40), at + 60))}`
  }
  if (promised.decision !== decision) return `expected the run to end ${promised.decision}, observed ${decision}`
  if (missing.length > 0) return `the run wrote no artifact at ${missing.map((artifact) => artifact.path).join(', ')}`
  return 'the check read no response'
}

const judged = <C>(
  report: Conformance.Report<C, RenderedArtifacts>,
  promised: RenderedArtifacts,
): Conformance.Pass =>
  Match.value(report).pipe(
    Match.tag('Pass', (pass) => pass),
    Match.orElse(() => {
      throw new Error(
        `expected the check to pass, but it read: ${Conformance.render(report)}\n${
          divergenceOf(promised, observedArtifactsOf(report))
        }`,
      )
    }),
  )

const extractionPipeline = <const F extends ExtractedPackage>(plan: ExtractionPlan<F>) =>
  Gherkin.Do.pipe(
    Given('a committed package and the artifacts it promises')('subject', () => extractionSubjectOf(plan)),
    When('the package is extracted under the schedules the kernel explores')(
      'checked',
      (s) =>
        Conformance.sequential(subjectOf(s.subject.seeded), {
          commands: Schema.Literal(plan.fixture),
          model: {
            state: ExpectedArtifacts,
            initial: { promised: s.subject.promised },
            precondition: () => true,
            step: (state) => [state, state.promised],
          },
          run: () => extractionOf(s.subject.seeded, plan),
          sequences: 1,
          operations: 1,
        }),
    ),
    Then('the artifacts written for it are the artifacts it promises')((s) => {
      if (judged(s.checked, s.subject.promised).histories <= 0) {
        throw new Error('expected the check to have judged at least one sequence')
      }
    }),
  )

Feature('Rendering a package\u2019s promised artifacts whatever order a run takes')
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .withLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'A package whose entry point never exports a type it uses still renders the report it promises',
      extractionPipeline(ANALYZER),
    )
    scenario(
      'A package that re-exports a third-party package renders the report it promises',
      extractionPipeline(EXTERNAL_API),
    )
    scenario(
      'A package that names an export only a star export provides renders the report it promises',
      extractionPipeline(EXTERNAL_STAR),
    )
    scenario(
      'A package that names a type an installed declaration package declares renders the report it promises',
      extractionPipeline(NODE_AMBIENT),
    )
    scenario(
      'A package that mentions a global variable renders the report it promises',
      extractionPipeline(GLOBAL_REFERENCE),
    )
    scenario(
      'A package that names a type an ambient declaration module provides renders the report it promises',
      extractionPipeline(AMBIENT_ALIAS),
    )
    scenario(
      'A package that imports a value through an import type renders the report it promises',
      extractionPipeline(VALUE_IMPORT_TYPE),
    )
    scenario(
      'A package that promises complete, public and beta reports renders each of them as committed',
      extractionPipeline(REPORT_PARITY),
    )
    scenario(
      'A namespace barrel that refers back to its entry point bundles to the rollup it promises',
      extractionPipeline(ROLLUP_AE3),
    )
    scenario(
      'A namespace that re-exports another namespace bundles to the rollup it promises',
      extractionPipeline(ROLLUP_NESTED),
    )
    scenario(
      'A namespace that re-exports a whole module bundles to the rollup it promises',
      extractionPipeline(ROLLUP_STAR),
    )
    scenario(
      'A package whose committed report matches its declarations renders the report it promises',
      extractionPipeline(CLEAN_PACKAGE),
    )
    scenario(
      'A package whose committed report describes declarations it no longer exports is refused',
      extractionPipeline(DRIFTED_PACKAGE),
    )
  })
