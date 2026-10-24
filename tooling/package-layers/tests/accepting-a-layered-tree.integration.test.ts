import { NodeFileSystem } from '@effect/platform-node-shared'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { passLines, runCheck } from '@systemfsoftware/tooling-package-layers'
import { Effect, Layer, Path } from 'effect'

const Feature = makeFeature({ it })

const tree = new URL('./__fixtures__/layered-tree', import.meta.url).pathname

Feature('Accepting a layered tree')
  .live('the committed fixture tree on disk')
  .withScenarioLayer(Layer.mergeAll(NodeFileSystem.layer, Path.layer))
  .body(({ scenario }) => {
    scenario(
      'A tree whose only cross-layer edge is a devDependency passes and reports that edge',
      Gherkin.Do.pipe(
        Given('a committed tree whose core package has a harness devDependency')('root', () => Effect.succeed(tree)),
        When('the layer check runs against that tree')(
          'report',
          ({ root }) => runCheck(root).pipe(Effect.map(passLines)),
        ),
        Then('the check passes and lists the devDependency as reported only')((state, expect) =>
          expect(state.report).toEqual([
            'core (1)',
            '  @f/core',
            'harness (1)',
            '  @f/harness',
            'spec-trace (0)',
            'extracted (0)',
            'frontend (1)',
            '  @f/app',
            'devDependencies across layers, reported only (1)',
            '  @f/core (core) -> @f/harness (harness)',
            'layers: 3 mapped packages, 3 present, each present package in exactly one of 5 layers; no forbidden edge',
          ])
        ),
      ),
    )
  })
