import { Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { makeTree, runConventions, TODO_RULE, VIOLATING_TSCONFIG, writeFile } from './__fixtures__/conventions-cli.js'

const checkExpect = expect

const Feature = makeFeature({ it, layer })
Feature('Composing consumer rules beside the bundled library').body(({ scenario }) => {
  scenario(
    'A consumer .grit/.md rule fires in the same scan as the bundled rules',
    Gherkin.Do.pipe(
      Given('a tree whose package.json carries a TODO key and a tsconfig lacks its node reference')(
        'tree',
        () =>
          Effect.succeed((() => {
            const tree = makeTree('conventions-comp-')
            writeFile(tree, 'pkg/tsconfig.json', VIOLATING_TSCONFIG)
            writeFile(tree, 'pkg/package.json', '{\n  "TODO": "fix me",\n  "name": "probe"\n}\n')
            writeFile(tree, 'rules/no_todo_key.md', TODO_RULE)
            return tree
          })()),
      ),
      Then('both rule ids report findings and the run exits 1')(({ tree }: { tree: string }) => {
        const run = runConventions(tree, [
          'scan',
          '--rules',
          'rules/no_todo_key.md',
          'pkg/tsconfig.json',
          'pkg/package.json',
        ])
        checkExpect(run.status, `engine stderr: ${run.stderr.slice(0, 500)}`).toBe(1)
        checkExpect(run.stdout).toContain('checked 2 files, 3 findings across 2 rules')
        checkExpect(run.stdout).toContain('consumer_no_todo_key')
      }),
    ),
  )

  scenario(
    'A consumer rule named like a bundled rule is namespaced instead of shadowing it',
    Gherkin.Do.pipe(
      Given('a consumer pattern file named require_tsconfig_node_reference and a violating tsconfig')(
        'tree',
        () =>
          Effect.succeed((() => {
            const tree = makeTree('conventions-shadow-')
            writeFile(tree, 'pkg/tsconfig.json', VIOLATING_TSCONFIG)
            writeFile(tree, 'rules/require_tsconfig_node_reference.md', TODO_RULE)
            return tree
          })()),
      ),
      Then('the bundled id still fires — the collision was namespaced away')(({ tree }: { tree: string }) => {
        const run = runConventions(tree, [
          'scan',
          '--rules',
          'rules/require_tsconfig_node_reference.md',
          'pkg/tsconfig.json',
        ])
        checkExpect(run.status, `engine stderr: ${run.stderr.slice(0, 500)}`).toBe(1)
        checkExpect(run.stdout).toContain('require_tsconfig_node_reference (error)')
      }),
    ),
  )
})
