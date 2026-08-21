import { readFileSync } from 'fs'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { checkerLayer, createTextMutant, groupMutants, resolveTestResource } from './__fixtures__/checker-harness.js'

const Feature = makeFeature({ it, layer })

const resolver = (...segments: string[]): string => resolveTestResource('project-with-ts-buildinfo', ...segments)
const tsconfigFile = resolver('tsconfig.json')

const indexSource = readFileSync(resolver('src', 'index.ts'), 'utf8')

const createMutant = (): Mutant =>
  createTextMutant({
    fileName: resolver('src', 'index.ts'),
    content: indexSource,
    findText: '',
    replacement: '',
  })

Feature('TypeScript checker on a project with a tsbuildinfo file')
  .body(({ scenario }) => {
    scenario(
      'Should_LoadProject_When_TsConfigCarriesBuildInfo',
      { layer: checkerLayer(tsconfigFile) },
      Gherkin.Do.pipe(
        Given('the project-with-ts-buildinfo fixture')(
          'mutant',
          () => Effect.succeed(createMutant()),
        ),
        When('the checker groups the only mutant')('groups', (s) => groupMutants([s.mutant])),
        Then('the mutant forms a single group')((s) => {
          expect(s.groups).toHaveLength(1)
        }),
      ),
    )
  })
