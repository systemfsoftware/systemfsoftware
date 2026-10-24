import { NodeFileSystem } from '@effect/platform-node-shared'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { failureLines, runCheck } from '@systemfsoftware/tooling-package-layers'
import { Effect, Layer, Path } from 'effect'

const Feature = makeFeature({ it })

const fixtures = new URL('./__fixtures__', import.meta.url).pathname

const ROWS = [
  { tree: 'map-refused', tag: 'MapRefused', fragment: 'package-layers.json' },
  { tree: 'manifest-refused', tag: 'ManifestRefused', fragment: 'packages/broken/package.json' },
  { tree: 'duplicate-name', tag: 'DuplicateName', fragment: "under both 'core' and 'harness'" },
  { tree: 'duplicate-manifest', tag: 'DuplicateManifest', fragment: 'is declared by both' },
  { tree: 'missing-package', tag: 'MissingPackage', fragment: 'no manifest under packages/ declares it' },
  { tree: 'unmapped-package', tag: 'UnmappedPackage', fragment: 'is not in package-layers.json' },
  { tree: 'schema-law-peer', tag: 'SchemaLawVitest', fragment: 'not marked optional in peerDependenciesMeta' },
  {
    tree: 'schema-law-fork',
    tag: 'SchemaLawVitest',
    fragment: 'names the @systemfsoftware/vitest fork in peerDependencies',
  },
  {
    tree: 'schema-law-fork-alias',
    tag: 'SchemaLawVitest',
    fragment: "'vitest' entry in peerDependencies that aliases the @systemfsoftware/vitest fork",
  },
  { tree: 'forbidden-edge', tag: 'ForbiddenEdge', fragment: 'core @f/source reaches harness @f/target' },
  {
    tree: 'forbidden-edge-transitive',
    tag: 'ForbiddenEdge',
    fragment: '@f/source -[dependencies]-> @f/mid -[peerDependencies]-> @f/target',
  },
] as const

Feature('Refusing known-bad layer trees')
  .live('the committed fixture trees on disk')
  .withScenarioLayer(Layer.mergeAll(NodeFileSystem.layer, Path.layer))
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'A tree that breaks the <tree> rule is refused naming what broke it',
      ROWS,
      (row) =>
        Gherkin.Do.pipe(
          Given('a committed tree that breaks one layer rule')('root', () => Effect.succeed(`${fixtures}/${row.tree}`)),
          When('the layer check runs against that tree')('report', ({ root }) =>
            runCheck(root).pipe(
              Effect.match({
                onFailure: (refused) => failureLines(refused.findings),
                onSuccess: () => [],
              }),
            )),
          Then('the refusal names the rule and the packages involved')((state, expect) =>
            expect(state.report.join('\n')).toSatisfy(
              (lines) => lines.includes(`title=layers-${row.tag}::`) && lines.includes(row.fragment),
              `names the ${row.tag} rule and the fragment "${row.fragment}"`,
            )
          ),
        ),
    )
  })
