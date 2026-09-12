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
Feature('Mediating the engine verdict into an exit contract').body(({ scenario }) => {
  scenario(
    'Findings at the gate level fail the run with file:line rule lines',
    Gherkin.Do.pipe(
      Given('a tree where one tsconfig lacks its node reference')('tree', () =>
        Effect.succeed((() => {
          const tree = makeTree('conventions-verdict-')
          writeFile(tree, 'good/tsconfig.json', CONFORMING_TSCONFIG)
          writeFile(tree, 'bad/tsconfig.json', VIOLATING_TSCONFIG)
          return tree
        })())),
      Then('the run exits 1 with one finding line and a summary')(({ tree }: { tree: string }) => {
        const run = runConventions(tree, ['scan', 'good/tsconfig.json', 'bad/tsconfig.json'])
        checkExpect(run.status).toBe(1)
        checkExpect(run.stdout).toMatch(/bad\/tsconfig\.json:1:1\s+require_tsconfig_node_reference \(error\)/u)
        checkExpect(run.stdout).toContain('checked 2 files, 1 findings across 1 rules')
      }),
    ),
  )

  scenario(
    'A clean tree exits 0 with a summary naming zero findings',
    Gherkin.Do.pipe(
      Given('a tree where every tsconfig declares its node reference')('tree', () =>
        Effect.succeed((() => {
          const tree = makeTree('conventions-clean-')
          writeFile(tree, 'a/tsconfig.json', CONFORMING_TSCONFIG)
          return tree
        })())),
      Then('the run exits 0')(({ tree }: { tree: string }) => {
        const run = runConventions(tree, ['scan', 'a/tsconfig.json'])
        checkExpect(run.status).toBe(0)
        checkExpect(run.stdout).toContain('checked 1 files, 0 findings')
      }),
    ),
  )

  scenario(
    'An unresolvable engine fails loud rather than reporting green',
    Gherkin.Do.pipe(
      Given('an environment with no grit engine on PATH')(
        'tree',
        () => Effect.succeed(makeTree('conventions-noengine-')),
      ),
      Then('the run exits 2 naming the resolution chain')(({ tree }: { tree: string }) => {
        const run = runConventions(tree, ['scan', 'a/tsconfig.json'], { ...process.env, PATH: '/nonexistent' })
        checkExpect(run.status).toBe(2)
        checkExpect(run.stderr).toContain('no grit engine found')
      }),
    ),
  )

  scenario(
    'JSONC comments in a tsconfig parse and the violation still reports',
    Gherkin.Do.pipe(
      Given('a comment-bearing tsconfig without the reference')('tree', () =>
        Effect.succeed((() => {
          const tree = makeTree('conventions-jsonc-')
          writeFile(tree, 'fork/tsconfig.json', '{\n  // fork rationale comment\n  "include": ["src"]\n}\n')
          return tree
        })())),
      Then('the run exits 1 with the finding on the comment-bearing file')(({ tree }: { tree: string }) => {
        const run = runConventions(tree, ['scan', 'fork/tsconfig.json'])
        checkExpect(run.status).toBe(1)
        checkExpect(run.stdout).toContain('require_tsconfig_node_reference')
      }),
    ),
  )

  scenario(
    'A bare basename reference satisfies the rule as the dotted form does',
    Gherkin.Do.pipe(
      Given('a tsconfig referencing tsconfig.node.json without the ./ prefix')('tree', () =>
        Effect.succeed((() => {
          const tree = makeTree('conventions-basename-')
          writeFile(tree, 'pkg/tsconfig.json', '{\n  "references": [{ "path": "tsconfig.node.json" }]\n}\n')
          return tree
        })())),
      Then('the run exits 0')(({ tree }: { tree: string }) => {
        const run = runConventions(tree, ['scan', 'pkg/tsconfig.json'])
        checkExpect(run.status).toBe(0)
      }),
    ),
  )
})
