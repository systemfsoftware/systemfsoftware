// Behaviour tests for the pnpm-guard file guard (U4), driven in-process through
// the exported run surface with an in-memory fs — the same shape the oxlint
// sibling uses. The guard's result carries only exit and stderr, so stdout
// emptiness is structural here (no channel exists) and is asserted at the
// process level by the hook smoke run.

import { assertEquals, assertStringIncludes } from '@std/assert'
import { runFileGuard } from './guard-files.ts'
import type { Fs } from './guard-files.ts'
import type { StdinResult } from './payload.ts'

type Tree = Readonly<Record<string, string>>

const ROOT = '/project'

const memFs = (tree: Tree): Fs => {
  const keyOf = (target: string): string => target.replace(/\/+$/, '')
  return {
    exists: (target) => Promise.resolve(keyOf(target) in tree),
    readTextFile: (target) => {
      const content = tree[keyOf(target)]
      return content === undefined
        ? Promise.reject(new Error(`no such file: ${target}`))
        : Promise.resolve(content)
    },
  }
}

const content = (toolName: string, toolInput: Record<string, unknown>): StdinResult => ({
  tag: 'content',
  content: JSON.stringify({ tool_name: toolName, tool_input: toolInput }),
})

const run = (stdin: StdinResult, tree: Tree = {}): Promise<{ exit: number; stderr: string }> =>
  runFileGuard(stdin, ROOT, memFs(tree))

const assertBlocked = async (stdin: StdinResult, tree: Tree, ...needles: string[]): Promise<void> => {
  const result = await run(stdin, tree)
  assertEquals(result.exit, 2)
  for (const needle of needles) {
    assertStringIncludes(result.stderr, needle)
  }
}

const assertAllowed = async (stdin: StdinResult, tree: Tree = {}): Promise<void> => {
  const result = await run(stdin, tree)
  assertEquals(result.exit, 0)
  assertEquals(result.stderr, '')
}

const WORKSPACE = 'pnpm-workspace.yaml'
const WORKSPACE_DISK = 'minimumReleaseAge: 1440\npackages:\n  - packages/*\n'
const WORKSPACE_TREE: Tree = { [`${ROOT}/pnpm-workspace.yaml`]: WORKSPACE_DISK }

const weakenAge = (filePath: string, from = 'minimumReleaseAge: 1440', to = 'minimumReleaseAge: 0'): StdinResult =>
  content('Edit', { file_path: filePath, old_string: from, new_string: to })

const EDIT_WEAKEN_AGE = weakenAge(WORKSPACE)
const EDIT_RAISE_AGE = weakenAge(WORKSPACE, 'minimumReleaseAge: 1440', 'minimumReleaseAge: 10080')
const WRITE_NEW_AGE_ZERO = content('Write', { file_path: WORKSPACE, content: 'minimumReleaseAge: 0\n' })
const CREATE_NEW_AGE_ZERO = content('Create', { file_path: WORKSPACE, content: 'minimumReleaseAge: 0\n' })
const WRITE_AGE_UNCHANGED = content('Write', { file_path: WORKSPACE, content: WORKSPACE_DISK })
const WRITE_AGE_BENIGN = content('Write', {
  file_path: WORKSPACE,
  content: '# quarantine\nminimumReleaseAge: 1440\npackages:\n  - packages/*\ncatalogs:\n  default:\n    react: ^19\n',
})

const EDIT_WEAKEN_AGE_ABSENT_HUNK = weakenAge(WORKSPACE, 'minimumReleaseAge: 9999', 'minimumReleaseAge: 0')

const MULTI_ONE_WEAKENING_HUNK = content('MultiEdit', {
  file_path: WORKSPACE,
  edits: [
    { old_string: 'packages:\n  - packages/*', new_string: 'packages:\n  - packages/*\n  - tools/*' },
    { old_string: 'minimumReleaseAge: 1440', new_string: 'minimumReleaseAge: 0' },
  ],
})

const MULTI_ALL_BENIGN = content('MultiEdit', {
  file_path: WORKSPACE,
  edits: [{ old_string: 'packages:\n  - packages/*', new_string: 'packages:\n  - packages/*\n  - tools/*' }],
})

const EDIT_BENIGN_COMMENT = content('Edit', {
  file_path: WORKSPACE,
  old_string: 'packages:',
  new_string: '# keep the quarantine\npackages:',
})

const MORPH_FILE_EDITS_WEAKEN = content('morph_mcp_edit-file', {
  file_path: WORKSPACE,
  file_edits: [{ find: 'minimumReleaseAge: 1440', replace: 'minimumReleaseAge: 0' }],
})

const MORPH_EDITS_WEAKEN = content('morph_edit', {
  file_path: WORKSPACE,
  edits: [{ old_string: 'minimumReleaseAge: 1440', new_string: 'minimumReleaseAge: 0' }],
})

const MORPH_RAW_CONTENT = content('morph_mcp_edit-file', { file_path: WORKSPACE, content: 'raw morph body' })

const WRITE_NEW_NPMRC_AUTH = content('Write', { file_path: '.npmrc', content: '_auth=secret\n' })

const EDIT_WEAKEN_STRICT_SSL = content('Edit', {
  file_path: '.npmrc',
  old_string: 'strict-ssl=true',
  new_string: 'strict-ssl=false',
})

const EDIT_PNPMFILE = content('Edit', { file_path: '.pnpmfile.mjs', old_string: 'a', new_string: 'b' })
const EDIT_PNPMFILE_CONTENTLESS = content('Edit', { file_path: '.pnpmfile.mjs' })
const WRITE_PNPMFILE_CJS = content('Write', { file_path: '.pnpmfile.cjs', content: 'module.exports = {}\n' })

const EDIT_UNPARSEABLE_WORKSPACE = content('Write', {
  file_path: WORKSPACE,
  content: 'minimumReleaseAge: [unclosed\n',
})

const EDIT_SOURCE = content('Edit', { file_path: 'src/index.ts', old_string: 'x = 1', new_string: 'x = 2' })
const EDIT_CONTENTLESS = content('Write', { file_path: WORKSPACE })
const READ_TOOL = content('Read', { file_path: WORKSPACE })
const NO_PATH = content('Edit', {})
const MALFORMED: StdinResult = { tag: 'content', content: 'this is not json' }
const OVERSIZE: StdinResult = { tag: 'too-large' }

const enforcement = (filePath: string, toolName = 'Edit'): StdinResult =>
  toolName === 'Write'
    ? content(toolName, { file_path: filePath, content: '{}\n' })
    : content(toolName, { file_path: filePath, old_string: 'a', new_string: 'b' })

// ---------------------------------------------------------------------------
// Guarded pnpm config files: the policy decides.
// ---------------------------------------------------------------------------

Deno.test('an Edit lowering minimumReleaseAge on the workspace file is refused, naming the setting', async () => {
  await assertBlocked(EDIT_WEAKEN_AGE, WORKSPACE_TREE, `${WORKSPACE} minimumReleaseAge`, '1440 -> 0')
})

Deno.test('an Edit raising minimumReleaseAge on the workspace file is allowed silently', async () => {
  await assertAllowed(EDIT_RAISE_AGE, WORKSPACE_TREE)
})

Deno.test('writing a brand-new workspace file with minimumReleaseAge 0 is refused from an empty old side', async () => {
  await assertBlocked(WRITE_NEW_AGE_ZERO, {}, `${WORKSPACE} minimumReleaseAge`, '1440 -> 0')
})

Deno.test('creating a brand-new workspace file with minimumReleaseAge 0 is refused', async () => {
  await assertBlocked(CREATE_NEW_AGE_ZERO, {}, `${WORKSPACE} minimumReleaseAge`)
})

Deno.test('rewriting the workspace file with identical content is allowed', async () => {
  await assertAllowed(WRITE_AGE_UNCHANGED, WORKSPACE_TREE)
})

Deno.test('a benign workspace rewrite that adds a comment and a catalogs entry is allowed silently', async () => {
  await assertAllowed(WRITE_AGE_BENIGN, WORKSPACE_TREE)
})

Deno.test('a benign workspace Edit that only adds a comment is allowed silently', async () => {
  await assertAllowed(EDIT_BENIGN_COMMENT, WORKSPACE_TREE)
})

Deno.test('a MultiEdit with one weakening hunk among benign hunks is refused', async () => {
  await assertBlocked(MULTI_ONE_WEAKENING_HUNK, WORKSPACE_TREE, '1440 -> 0')
})

Deno.test('a MultiEdit whose hunks are all benign on the workspace file is allowed', async () => {
  await assertAllowed(MULTI_ALL_BENIGN, WORKSPACE_TREE)
})

Deno.test('a morph file_edits weakening on the workspace file is refused', async () => {
  await assertBlocked(MORPH_FILE_EDITS_WEAKEN, WORKSPACE_TREE, '1440 -> 0')
})

Deno.test('a morph edits weakening on the workspace file is refused', async () => {
  await assertBlocked(MORPH_EDITS_WEAKEN, WORKSPACE_TREE, '1440 -> 0')
})

Deno.test('a raw morph body on a guarded file is refused as unverifiable', async () => {
  await assertBlocked(MORPH_RAW_CONTENT, WORKSPACE_TREE, 'cannot verify')
})

Deno.test('a workspace Edit whose hunk is absent from disk is refused as unverifiable', async () => {
  await assertBlocked(EDIT_WEAKEN_AGE_ABSENT_HUNK, WORKSPACE_TREE, 'cannot verify', 'minimumReleaseAge: 9999')
})

Deno.test('an unparseable YAML after-side is refused as unverifiable', async () => {
  await assertBlocked(EDIT_UNPARSEABLE_WORKSPACE, WORKSPACE_TREE, 'cannot verify')
})

Deno.test('writing a new .npmrc carrying _auth is refused, naming the credential line', async () => {
  await assertBlocked(WRITE_NEW_NPMRC_AUTH, {}, '.npmrc _auth', 'absent -> present')
})

Deno.test('an .npmrc Edit that drops strict-ssl is refused, naming the setting', async () => {
  await assertBlocked(EDIT_WEAKEN_STRICT_SSL, { [`${ROOT}/.npmrc`]: 'strict-ssl=true\n' }, '.npmrc strict-ssl')
})

Deno.test('a guarded workspace file at depth is still policy-checked', async () => {
  await assertBlocked(
    weakenAge('packages/x/pnpm-workspace.yaml'),
    { [`${ROOT}/packages/x/pnpm-workspace.yaml`]: 'minimumReleaseAge: 1440\n' },
    `${WORKSPACE} minimumReleaseAge`,
  )
})

Deno.test('a guarded basename under an enforcement directory is policy-checked', async () => {
  await assertBlocked(
    weakenAge('agent-plugins/x/src/pnpm-workspace.yaml'),
    { [`${ROOT}/agent-plugins/x/src/pnpm-workspace.yaml`]: 'minimumReleaseAge: 1440\n' },
    `${WORKSPACE} minimumReleaseAge`,
  )
})

Deno.test('an absolute path inside the root is resolved once and policy-checked', async () => {
  await assertBlocked(weakenAge(`${ROOT}/${WORKSPACE}`), WORKSPACE_TREE, '1440 -> 0')
})

Deno.test('an absolute path outside the root that carries a guarded basename is still policy-checked', async () => {
  await assertBlocked(
    weakenAge('/elsewhere/pnpm-workspace.yaml'),
    { '/elsewhere/pnpm-workspace.yaml': WORKSPACE_DISK },
    `${WORKSPACE} minimumReleaseAge`,
    '1440 -> 0',
  )
})

Deno.test('a workspace Edit is not refused by a pre-existing weak .npmrc the edit does not touch', async () => {
  await assertAllowed(EDIT_RAISE_AGE, { ...WORKSPACE_TREE, [`${ROOT}/.npmrc`]: 'strict-ssl=false\n' })
})

Deno.test('a benign .npmrc rewrite is allowed even when the on-disk file is already weak', async () => {
  await assertAllowed(
    content('Write', { file_path: '.npmrc', content: 'strict-ssl=false\n# note\n' }),
    { [`${ROOT}/.npmrc`]: 'strict-ssl=false\n' },
  )
})

// ---------------------------------------------------------------------------
// .pnpmfile: install-time code, refused outright.
// ---------------------------------------------------------------------------

Deno.test('a content-bearing Edit to .pnpmfile.mjs is refused as human-written install-time code', async () => {
  await assertBlocked(EDIT_PNPMFILE, {}, '.pnpmfile.mjs', 'human-written', 'ask a human')
})

Deno.test('writing .pnpmfile.cjs is refused as human-written install-time code', async () => {
  await assertBlocked(WRITE_PNPMFILE_CJS, {}, '.pnpmfile.cjs', 'human-written')
})

Deno.test('a contentless Edit to .pnpmfile.mjs is allowed', async () => {
  await assertAllowed(EDIT_PNPMFILE_CONTENTLESS)
})

// ---------------------------------------------------------------------------
// Enforcement surfaces: human-edited, refused.
// ---------------------------------------------------------------------------

Deno.test('an edit to the guard implementation itself is refused as a human-edited surface', async () => {
  await assertBlocked(
    enforcement('agent-plugins/pnpm-guard/src/policy.ts'),
    {},
    'agent-plugins/pnpm-guard/src/policy.ts',
    'human-edited',
    'ask a human',
  )
})

Deno.test('a write to a plugin deno.jsonc is refused as a human-edited surface', async () => {
  await assertBlocked(enforcement('agent-plugins/pnpm-guard/deno.jsonc', 'Write'), {}, 'human-edited')
})

Deno.test('an edit to a plugin manifest is refused as a human-edited surface', async () => {
  await assertBlocked(enforcement('agent-plugins/pnpm-guard/plugin.json'), {}, 'human-edited')
})

Deno.test('a write to a plugin deno.lock is refused as a human-edited surface', async () => {
  await assertBlocked(enforcement('agent-plugins/pnpm-guard/deno.lock', 'Write'), {}, 'human-edited')
})

Deno.test('an edit to a plugin hooks directory is refused as a human-edited surface', async () => {
  await assertBlocked(enforcement('agent-plugins/pnpm-guard/hooks/hooks.json'), {}, 'human-edited')
})

Deno.test('an edit to any other plugin source is refused as a human-edited surface', async () => {
  await assertBlocked(enforcement('agent-plugins/oxlint-guard/src/guard-config.ts'), {}, 'human-edited')
})

Deno.test('an edit to a .claude hook is refused as a human-edited surface', async () => {
  await assertBlocked(enforcement('.claude/hooks/guard-protected-writes.ts'), {}, 'human-edited')
})

Deno.test('an edit to .claude/settings.json is refused as a human-edited surface', async () => {
  await assertBlocked(enforcement('.claude/settings.json'), {}, '.claude/settings.json', 'human-edited')
})

Deno.test('a write to .claude/deno.jsonc is refused as a human-edited surface', async () => {
  await assertBlocked(enforcement('.claude/deno.jsonc', 'Write'), {}, 'human-edited')
})

Deno.test('a write to .claude/deno.lock is refused as a human-edited surface', async () => {
  await assertBlocked(enforcement('.claude/deno.lock', 'Write'), {}, 'human-edited')
})

Deno.test('an edit to the marketplace manifest is refused as a human-edited surface', async () => {
  await assertBlocked(
    enforcement('.claude-plugin/marketplace.json'),
    {},
    '.claude-plugin/marketplace.json',
    'human-edited',
  )
})

// ---------------------------------------------------------------------------
// Everything else: allowed, silent.
// ---------------------------------------------------------------------------

Deno.test('a plugin file outside the enforcement surface is allowed', async () => {
  await assertAllowed(enforcement('agent-plugins/pnpm-guard/README.md'))
})

Deno.test('a sibling directory whose name merely starts with src is not an enforcement surface', async () => {
  await assertAllowed(enforcement('agent-plugins/pnpm-guard/srcfoo/guard.ts'))
})

Deno.test('a plugin-root file that is not a manifest is allowed', async () => {
  await assertAllowed(enforcement('agent-plugins/pnpm-guard/deno.json'))
})

Deno.test('a .claude file that is not a hook or a guarded manifest is allowed', async () => {
  await assertAllowed(enforcement('.claude/settings.local.json'))
})

Deno.test('a .claude manifest outside the manifest set is allowed', async () => {
  await assertAllowed(enforcement('.claude/other/deno.jsonc'))
})

Deno.test('a nested marketplace file outside .claude-plugin is allowed', async () => {
  await assertAllowed(enforcement('.claude-plugin/other/marketplace.json'))
})

Deno.test('an edit to an ordinary source file is allowed', async () => {
  await assertAllowed(EDIT_SOURCE)
})

Deno.test('an edit payload that carries no content is allowed', async () => {
  await assertAllowed(EDIT_CONTENTLESS)
})

Deno.test('a non-edit tool payload is ignored', async () => {
  await assertAllowed(READ_TOOL)
})

Deno.test('input that is not a hook payload is ignored', async () => {
  await assertAllowed(MALFORMED)
})

Deno.test('a payload without a file path is ignored', async () => {
  await assertAllowed(NO_PATH)
})

// ---------------------------------------------------------------------------
// Fail-closed transport.
// ---------------------------------------------------------------------------

Deno.test('an oversized stdin payload is refused as unverifiable', async () => {
  await assertBlocked(OVERSIZE, {}, 'cannot verify', 'input cap')
})
