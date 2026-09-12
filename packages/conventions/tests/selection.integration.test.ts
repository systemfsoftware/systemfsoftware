import { Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import {
  CONFORMING_TSCONFIG,
  makeTree,
  runConventions,
  VIOLATING_TSCONFIG,
  writeFile,
} from './__fixtures__/conventions-cli.js'

const checkExpect = expect

const Feature = makeFeature({ it, layer })
Feature('Selecting target files under roots').body(({ scenario }) => {
  scenario(
    'Every first-party tsconfig.json under a root is scanned at any depth while node_modules stays out',
    Gherkin.Do.pipe(
      Given('a tree with nested, violating, and node_modules tsconfigs')('tree', () =>
        Effect.succeed((() => {
          const tree = makeTree('conventions-sel-')
          writeFile(tree, 'pkg-a/tsconfig.json', CONFORMING_TSCONFIG)
          writeFile(tree, 'pkg-a/nested/deep/tsconfig.json', VIOLATING_TSCONFIG)
          writeFile(tree, 'pkg-a/node_modules/dep/tsconfig.json', VIOLATING_TSCONFIG)
          return tree
        })())),
      Then('the scan names the first-party finding and exits 1')(({ tree }: { tree: string }) => {
        const run = runConventions(tree, ['scan', 'pkg-a/**/tsconfig.json'])
        checkExpect(run.status).toBe(1)
        checkExpect(run.stdout).toContain('pkg-a/nested/deep/tsconfig.json')
        checkExpect(run.stdout).not.toContain('node_modules')
        checkExpect(run.stdout).toContain('checked 2 files, 1 findings across 1 rules')
      }),
    ),
  )

  scenario(
    'An exempt subtree carved by --ignore produces no finding',
    Gherkin.Do.pipe(
      Given('a tree with a fixtures subtree that must be exempt')('tree', () =>
        Effect.succeed((() => {
          const tree = makeTree('conventions-ign-')
          writeFile(tree, 'pkg/tsconfig.json', CONFORMING_TSCONFIG)
          writeFile(tree, 'pkg/fixtures/tsconfig.json', VIOLATING_TSCONFIG)
          return tree
        })())),
      Then('the run exits 0 having checked only the kept file')(({ tree }: { tree: string }) => {
        const run = runConventions(tree, ['scan', 'pkg/**/tsconfig.json', '--ignore', 'pkg/fixtures'])
        checkExpect(run.status).toBe(0)
        checkExpect(run.stdout).toContain('checked 1 files, 0 findings')
      }),
    ),
  )

  scenario(
    'A roots-mode scan that matches nothing fails loud instead of reporting green',
    Gherkin.Do.pipe(
      Given('a tree with no tsconfig.json at all')('tree', () => Effect.succeed(makeTree('conventions-empty-'))),
      Then('the run exits 2 saying it scanned 0 files')(({ tree }: { tree: string }) => {
        const run = runConventions(tree, ['scan', 'pkg/**/tsconfig.json'])
        checkExpect(run.status).toBe(2)
        checkExpect(run.stdout).toContain('scanned 0 files')
      }),
    ),
  )

  scenario(
    'File mode with no staged targets exits clean without demands',
    Gherkin.Do.pipe(
      Given('a precommit invocation over a staged set containing no tsconfig.json')(
        'tree',
        () => Effect.succeed(makeTree('conventions-none-')),
      ),
      Then('the run exits 0 having checked nothing')(({ tree }: { tree: string }) => {
        const run = runConventions(tree, ['scan'])
        checkExpect(run.status).toBe(0)
        checkExpect(run.stdout).toContain('scanned 0 files')
      }),
    ),
  )
})
