import { existsSync, readFileSync } from 'fs'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Effect } from 'effect'
import { expect } from 'vitest'

import {
  checkerLayer,
  checkMutants,
  CheckStatus,
  createTextMutant,
  groupMutants,
  resolveTestResource,
} from './__fixtures__/checker-harness.js'

const Feature = makeFeature({ it, layer })

const resolver = (...segments: string[]): string => resolveTestResource('project-references', ...segments)
const tsconfigFile = resolver('tsconfig.root.json')
const checkedProjectReferences = { layer: checkerLayer(tsconfigFile) }

const fileContents: Record<FixtureFile, string> = Object.freeze({
  'index.ts': readFileSync(resolver('src', 'index.ts'), 'utf8'),
  'job.ts': readFileSync(resolver('src', 'job.ts'), 'utf8'),
  'math.ts': readFileSync(resolver('utils', 'math.ts'), 'utf8'),
  'text.ts': readFileSync(resolver('utils', 'text.ts'), 'utf8'),
})

type FixtureFile = 'index.ts' | 'job.ts' | 'math.ts' | 'text.ts'

const createMutant = (
  fileName: FixtureFile,
  findText: string,
  replacement: string,
  id = '42',
): Mutant =>
  createTextMutant({
    fileName: resolver('src', fileName),
    content: fileContents[fileName],
    findText,
    replacement,
    id,
  })

Feature('TypeScript checker on a project with project references')
  .body(({ scenario }) => {
    scenario(
      'Should_NotWriteOutput_When_ProjectInitialises',
      checkedProjectReferences,
      Gherkin.Do.pipe(
        Given('the project-references fixture')(() => Effect.succeed(resolver())),
        Then('no dist directory exists on disk')(() =>
          Effect.sync(() => {
            expect(existsSync(resolver('dist')), 'Output was written to disk!').toBe(false)
          })
        ),
      ),
    )

    scenario(
      'Should_ReportPassed_When_MutantIsValid',
      checkedProjectReferences,
      Gherkin.Do.pipe(
        Given('a valid mutant in the source project')(
          'mutant',
          () => Effect.succeed(createMutant('job.ts', 'Starting job', 'stryker was here')),
        ),
        When('the checker validates it')('result', (s) => checkMutants([s.mutant])),
        Then('the verdict is Passed')((s) => {
          expect(s.result[s.mutant.id]).toEqual({ status: CheckStatus.Passed })
        }),
      ),
    )

    scenario(
      'Should_ReportPassed_When_UnusedLocalVarMutates',
      checkedProjectReferences,
      Gherkin.Do.pipe(
        Given('a mutant that only changes an unused local')(
          'mutant',
          () =>
            Effect.succeed(
              createMutant('job.ts', 'toUpperCase(logText)', 'toUpperCase("")'),
            ),
        ),
        When('the checker validates it')('result', (s) => checkMutants([s.mutant])),
        Then('the verdict is Passed because noUnusedLocals is overridden')((s) => {
          expect(s.result[s.mutant.id]).toEqual({ status: CheckStatus.Passed })
        }),
      ),
    )

    scenario(
      'Should_MergeLinkedProjects_When_GroupingMutantsAcrossReferences',
      checkedProjectReferences,
      Gherkin.Do.pipe(
        Given('mutants in the root project and in a referenced project')(
          'mutants',
          () =>
            Effect.succeed([
              createMutant('job.ts', 'Starting job', '', '42'),
              createMutant('text.ts', 'toUpperCase()', 'toLowerCase()', '43'),
              createMutant('math.ts', 'array.length', '1', '44'),
            ]),
        ),
        When('the checker groups them')('groups', (s) => groupMutants(s.mutants)),
        Then('mutants across the reference merge into two groups')((s) => {
          expect(s.groups).toHaveLength(2)
        }),
      ),
    )
  })
