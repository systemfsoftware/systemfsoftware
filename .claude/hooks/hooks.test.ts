// Falsification suite. Every guard must fire on its known-bad payload AND stay
// silent on a known-good one: a guard that only ever fires, or only ever passes,
// is not a gate. Cells marked "transcript" replay commands this repo actually
// ran rather than payloads this file's author invented.

import { assert, assertEquals, assertFalse, assertStringIncludes } from '@std/assert'
import { describe, it } from '@std/testing/bdd'
import { decide, type Facts, relativeTarget, type WritePayload } from './guard-protected-writes.ts'
import { unscopedCall } from './guard-qmd-scope.ts'
import { isWikiScopedQuery } from './stamp-wiki-query.ts'

const ROOT = '/repo'
const base: Facts = { root: ROOT, corpusPresent: true, queryStamped: false }

const write = (path: string, content = ''): WritePayload => ({
  tool_input: { file_path: `${ROOT}/${path}`, content },
})

const refusalFor = (payload: WritePayload, facts: Facts = base): string => {
  const verdict = decide(payload, facts)
  assert(verdict.refused, 'expected the guard to refuse this payload')
  return verdict.reason
}

const allows = (payload: WritePayload, facts: Facts = base): void =>
  assertFalse(decide(payload, facts).refused, 'expected the guard to allow this payload')

describe('guard-protected-writes / REPO-S3 vendored subtrees', () => {
  it('refuses a write into a vendored subtree', () => {
    assertStringIncludes(refusalFor(write('repos/constitution/CONSTITUTION.md', 'x')), 'REPO-S3')
  })

  it('allows repos/AGENTS.md, which is ours', () => {
    allows(write('repos/AGENTS.md', 'x'))
  })

  it('allows an ordinary source write', () => {
    allows(write('packages/hex-schema/src/mod.ts', 'export const a = 1'))
  })
})

describe('guard-protected-writes / REPO-S1 isolatedDeclarations', () => {
  it('refuses enabling it', () => {
    assertStringIncludes(refusalFor(write('tsconfig.json', `{ "isolatedDeclarations": true }`)), 'REPO-S1')
  })

  it('refuses it in a nested tsconfig variant', () => {
    refusalFor(write('packages/hex-schema/tsconfig.build.json', `{"isolatedDeclarations":true}`))
  })

  it('allows a tsconfig that disables it', () => {
    allows(write('tsconfig.json', `{ "isolatedDeclarations": false }`))
  })
})

describe('guard-protected-writes / REPO-S2 supply-chain cutoff', () => {
  it('refuses a minimumReleaseAgeExclude edit', () => {
    assertStringIncludes(
      refusalFor(write('pnpm-workspace.yaml', 'minimumReleaseAgeExclude:\n  - foo')),
      'REPO-S2',
    )
  })

  it('allows an unrelated workspace edit', () => {
    allows(write('pnpm-workspace.yaml', "packages:\n  - 'packages/*'"))
  })
})

describe('guard-protected-writes / REPO-W4 search before planning', () => {
  it('refuses a plan written before any corpus query', () => {
    assertStringIncludes(refusalFor(write('docs/plans/2026-08-10-001-feat-x-plan.md', '# Plan')), 'REPO-W4')
  })

  it('allows the plan once a query is stamped', () => {
    allows(write('docs/plans/x-plan.md', '# Plan'), { ...base, queryStamped: true })
  })

  it('allows the plan in a clone with no corpus', () => {
    allows(write('docs/plans/x-plan.md', '# Plan'), { ...base, corpusPresent: false })
  })
})

describe('guard-protected-writes / payload shapes', () => {
  it('reads the Edit shape, not only Write', () => {
    refusalFor({
      tool_input: { file_path: `${ROOT}/tsconfig.json`, new_string: `"isolatedDeclarations": true` },
    })
  })

  it('reads every edit in the MultiEdit shape', () => {
    refusalFor({
      tool_input: {
        file_path: `${ROOT}/tsconfig.json`,
        edits: [{ new_string: `"strict": true` }, { new_string: `"isolatedDeclarations": true` }],
      },
    })
  })

  it('allows a payload naming no path', () => {
    allows({ tool_input: { content: 'x' } })
  })
})

describe('guard-protected-writes / path resolution', () => {
  it('treats a path outside the project root as none of its business', () => {
    assertEquals(relativeTarget('/etc/hosts', ROOT), null)
    allows({ tool_input: { file_path: '/etc/hosts', content: 'x' } })
  })

  it('refuses a traversal that escapes the root rather than matching on it', () => {
    assertEquals(relativeTarget('/repo/../etc/hosts', ROOT), null)
  })

  it('keeps a relative payload path as given', () => {
    assertEquals(relativeTarget('repos/x/README.md', ROOT), 'repos/x/README.md')
  })
})

describe('guard-qmd-scope / REPO-W5 scoped retrieval', () => {
  it('refuses a bare query, search and vsearch', () => {
    assertEquals(unscopedCall(`qmd query "attention sink"`), `qmd query "attention sink"`)
    assert(unscopedCall(`qmd search "x"`) !== null)
    assert(unscopedCall(`qmd vsearch "x"`) !== null)
  })

  it('allows the -c and --collection= forms', () => {
    assertEquals(unscopedCall(`qmd query -c wiki "x"`), null)
    assertEquals(unscopedCall(`qmd query --collection=wiki "x"`), null)
  })

  it('allows already-scoped subcommands', () => {
    assertEquals(unscopedCall(`qmd ls wiki`), null)
    assertEquals(unscopedCall(`qmd collection list`), null)
    assertEquals(unscopedCall(`qmd get qmd://wiki/manifest.md`), null)
  })

  it('leaves an unrelated command alone', () => {
    assertEquals(unscopedCall(`pnpm check`), null)
  })

  it('refuses to let a later scoped call launder an earlier unscoped one', () => {
    assert(unscopedCall(`qmd query "a" | qmd query -c wiki "b"`) !== null)
  })
})

describe('guard-qmd-scope / transcript fixtures', () => {
  // The first version of this guard refused --help, a real command from this
  // session. Every fixture written in the guard author's own words had passed.
  it('allows qmd query --help, which needs no scope', () => {
    assertEquals(unscopedCall(`qmd query --help 2>&1 | sed -n '1,40p'`), null)
  })

  it('allows a scoped search piped into grep', () => {
    assertEquals(unscopedCall(`cd /repo && qmd search -c wiki "AGENTS.md precedence" 2>&1 | head -35`), null)
  })

  it('still refuses a bare query after cd', () => {
    assert(unscopedCall(`cd /repo && qmd query "AGENTS.md precedence nearest file wins"`) !== null)
  })
})

describe('stamp-wiki-query', () => {
  it('stamps only a wiki-scoped query', () => {
    assert(isWikiScopedQuery(`qmd query -c wiki "x"`))
    assert(isWikiScopedQuery(`qmd search --collection=wiki "x"`))
  })

  it('does not stamp another collection or an unrelated command', () => {
    assertFalse(isWikiScopedQuery(`qmd query -c docs "x"`))
    assertFalse(isWikiScopedQuery(`qmd query "x"`))
    assertFalse(isWikiScopedQuery(`pnpm check`))
  })
})

const runHook = async (hook: string, stdin: string): Promise<number> => {
  const command = new Deno.Command(new URL(hook, import.meta.url).pathname, {
    stdin: 'piped',
    stdout: 'null',
    stderr: 'null',
    env: { CLAUDE_PROJECT_DIR: ROOT },
  })
  const child = command.spawn()
  const writer = child.stdin.getWriter()
  await writer.write(new TextEncoder().encode(stdin))
  await writer.close()
  return (await child.status).code
}

describe('executable contract', () => {
  it('exits 2 on known-bad and 0 on known-good for the write guard', async () => {
    const bad = JSON.stringify({ tool_input: { file_path: `${ROOT}/repos/x/README.md`, content: 'x' } })
    const good = JSON.stringify({ tool_input: { file_path: `${ROOT}/repos/AGENTS.md`, content: 'x' } })
    assertEquals(await runHook('./guard-protected-writes.ts', bad), 2)
    assertEquals(await runHook('./guard-protected-writes.ts', good), 0)
  })

  it('exits 2 on known-bad and 0 on known-good for the qmd guard', async () => {
    const bad = JSON.stringify({ tool_input: { command: `qmd query "x"` } })
    const good = JSON.stringify({ tool_input: { command: `qmd query -c wiki "x"` } })
    assertEquals(await runHook('./guard-qmd-scope.ts', bad), 2)
    assertEquals(await runHook('./guard-qmd-scope.ts', good), 0)
  })

  it('does not brick the write path on an unparseable payload', async () => {
    assertEquals(await runHook('./guard-protected-writes.ts', 'not json at all'), 0)
  })
})
