import { readFileSync } from 'fs'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Effect } from 'effect'
import { expect } from 'vitest'

import {
  checkerLayer,
  checkMutants,
  CheckStatus,
  createTextMutant,
  resolveTestResource,
} from './__fixtures__/checker-harness.js'

const Feature = makeFeature({ it, layer })

const resolver = (...segments: string[]): string => resolveTestResource('nodenext-project', ...segments)
const tsconfigFile = resolver('tsconfig.json')
const checkedNodeNext = { layer: checkerLayer(tsconfigFile) }

const utilSource = readFileSync(resolver('src', 'util.ts'), 'utf8')

const createMutant = (findText: string, replacement: string, id: string): Mutant =>
  createTextMutant({
    fileName: resolver('src', 'util.ts'),
    content: utilSource,
    findText,
    replacement,
    id,
  })

Feature('TypeScript checker on a NodeNext project targeting es2024')
  .body(({ scenario }) => {
    scenario(
      'Should_ReportPassed_When_MutantKeepsProjectCompiling',
      checkedNodeNext,
      Gherkin.Do.pipe(
        Given('a mutant that flips an even check')(
          'mutant',
          () => Effect.succeed(createMutant('value % 2 === 0', 'value % 2 !== 0', 'passing')),
        ),
        When('the checker validates it')('result', (s) => checkMutants([s.mutant])),
        Then('the verdict is Passed')((s) => {
          expect(s.result).toEqual({ passing: { status: CheckStatus.Passed } })
        }),
      ),
    )

    scenario(
      'Should_ReportCompileError_When_MutantViolatesReturnType',
      checkedNodeNext,
      Gherkin.Do.pipe(
        Given('a mutant that returns a number where a string literal is declared')(
          'mutant',
          () => Effect.succeed(createMutant("'even'", '42', 'breaking')),
        ),
        When('the checker validates it')('result', (s) => checkMutants([s.mutant])),
        Then('the verdict is CompileError')((s) => {
          expect(s.result['breaking']?.status).toBe(CheckStatus.CompileError)
        }),
      ),
    )
  })
