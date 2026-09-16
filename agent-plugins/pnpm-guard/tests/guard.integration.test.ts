// Integration suite for the pnpm-guard hooks: the composed program driven end
// to end against a real project tree on disk — payload decode, target
// classification, real posture reads, the policy core, and the exit contract.
//
// The two shells carry no unit tests of their own. Every branch they hold is
// reached from here through the composed surface, as scenario rows rather than
// one case per internal decision; the flag, edit-shape, and key matrices are
// data below, and the pure decision core keeps its own suite in
// src/policy.test.ts.

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, join } from '@std/path'
import { runCommandGuard } from '../src/guard-commands.ts'
import { runFileGuard } from '../src/guard-files.ts'

const AGE = 'minimumReleaseAge'
const EXCLUDE = 'minimumReleaseAgeExclude'
const BLOCK_EXOTIC = 'blockExoticSubdeps'
const STRICT_DEP = 'strictDepBuilds'
const TRUST_LOCK = 'trustLockfile'
const ALLOW_BUILDS = 'allowBuilds'
const QUARANTINE = String(1440)
const SHORT_QUARANTINE = String(0)
const LONG_QUARANTINE = String(10080)
const OFF = 'false'
const TOKEN = 'placeholder-token'
const GUARD_SRC = 'agent-plugins/pnpm-guard/src/guard-files.ts'

/** A tree pnpm would read: a default workspace, plus whatever the case adds. */
const DEFAULT_WORKSPACE = `${AGE}: ${QUARANTINE}\n${BLOCK_EXOTIC}: true\npackages:\n  - packages/*\n`

interface Project {
  readonly root: string
  readonly fileGuard: (
    filePath: string,
    toolInput: Record<string, unknown>,
    toolName?: string,
  ) => Promise<{ exit: number; stderr: string }>
  readonly commandGuard: (command: string) => { exit: number; stderr: string }
}

const withProject = async (files: Record<string, string>, body: (project: Project) => Promise<void>): Promise<void> => {
  const root = await Deno.makeTempDir({ prefix: 'pnpm-guard-' })
  try {
    for (const [path, content] of Object.entries(files)) {
      const target = join(root, path)
      await Deno.mkdir(dirname(target), { recursive: true })
      await Deno.writeTextFile(target, content)
    }
    const project: Project = {
      root,
      fileGuard: (filePath, toolInput, toolName = 'Edit') =>
        runFileGuard(
          {
            tag: 'content',
            content: JSON.stringify({
              tool_name: toolName,
              tool_input: { file_path: join(root, filePath), ...toolInput },
            }),
          },
          root,
        ),
      // The shipped shell's reads, verbatim: the workspace and npmrc beside the
      // project root, absent reading as empty.
      commandGuard: (command) =>
        runCommandGuard({
          payload: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
          reads: {
            workspaceYaml: () => readSource(join(root, 'pnpm-workspace.yaml')),
            npmrc: () => readSource(join(root, '.npmrc')),
          },
        }),
    }
    await body(project)
  } finally {
    await Deno.remove(root, { recursive: true })
  }
}

const readSource = (path: string): string => {
  try {
    return Deno.readTextFileSync(path)
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return ''
    }
    throw error
  }
}

interface Row {
  readonly label: string
  readonly run: (project: Project) => Promise<{ exit: number; stderr: string }> | { exit: number; stderr: string }
  readonly cares: string
}

const refuses = async (project: Project, rows: readonly Row[]): Promise<void> => {
  for (const row of rows) {
    const result = await row.run(project)
    assertEquals(result.exit, 2, `${row.label}: expected a refusal, got exit ${result.exit} (${result.stderr})`)
    assertStringIncludes(result.stderr, row.cares, `${row.label}: stderr did not name ${row.cares}`)
  }
}

const passes = async (project: Project, rows: readonly Row[]): Promise<void> => {
  for (const row of rows) {
    const result = await row.run(project)
    assertEquals(result, { exit: 0, stderr: '' }, `${row.label}: expected a silent pass`)
  }
}

const edit = (
  label: string,
  filePath: string,
  oldString: string,
  newString: string,
  cares = '',
  extra: Record<string, unknown> = {},
): Row => ({
  label,
  cares,
  run: (project) => project.fileGuard(filePath, { old_string: oldString, new_string: newString, ...extra }),
})

const write = (label: string, filePath: string, content: string, cares = '', toolName = 'Write'): Row => ({
  label,
  cares,
  run: (project) => project.fileGuard(filePath, { content }, toolName),
})

const multi = (label: string, filePath: string, edits: readonly Record<string, string>[], cares = ''): Row => ({
  label,
  cares,
  run: (project) => project.fileGuard(filePath, { edits }, 'MultiEdit'),
})

const morph = (
  label: string,
  filePath: string,
  edits: readonly Record<string, string>[],
  cares = '',
  key: 'edits' | 'file_edits' = 'edits',
): Row => ({
  label,
  cares,
  run: (project) => project.fileGuard(filePath, { [key]: edits }, 'morph_mcp_edit-file'),
})

const bash = (label: string, command: string, cares = ''): Row => ({
  label,
  cares,
  run: (project) => project.commandGuard(command),
})

const refused = (label: string, command: string, cares = 'weakens pnpm'): Row => bash(label, command, cares)

// ---------------------------------------------------------------------------
// The edit surfaces: a weakening through any file-guard route is refused, and
// its benign twin passes silently.
// ---------------------------------------------------------------------------

Deno.test('every guarded file-edit route refuses its weakening and passes its benign twin', async () => {
  const nested = 'packages/app/pnpm-workspace.yaml'
  await withProject({
    'pnpm-workspace.yaml': DEFAULT_WORKSPACE,
    '.npmrc': 'strict-ssl=true\n',
    [nested]: DEFAULT_WORKSPACE,
  }, async (project) => {
    await refuses(project, [
      edit(
        'workspace: the age drops',
        'pnpm-workspace.yaml',
        `${AGE}: ${QUARANTINE}`,
        `${AGE}: ${SHORT_QUARANTINE}`,
        AGE,
      ),
      edit(
        'workspace: an exclusion entry is added',
        'pnpm-workspace.yaml',
        `${BLOCK_EXOTIC}: true`,
        `${BLOCK_EXOTIC}: true\n${EXCLUDE}:\n  - fresh-pkg`,
        EXCLUDE,
      ),
      edit(
        'workspace: a build grant lands',
        'pnpm-workspace.yaml',
        `${BLOCK_EXOTIC}: true`,
        `${BLOCK_EXOTIC}: true\n${ALLOW_BUILDS}:\n  esbuild: true`,
        ALLOW_BUILDS,
      ),
      edit(
        'workspace: the scalar grant shape lands',
        'pnpm-workspace.yaml',
        `${BLOCK_EXOTIC}: true`,
        `${BLOCK_EXOTIC}: true\n${ALLOW_BUILDS}: esbuild`,
        ALLOW_BUILDS,
      ),
      edit(
        'workspace: replace_all carries the weakening',
        'pnpm-workspace.yaml',
        `${AGE}: ${QUARANTINE}`,
        `${AGE}: ${SHORT_QUARANTINE}`,
        AGE,
        { replace_all: true },
      ),
      edit('npmrc: an auth line lands', '.npmrc', 'strict-ssl=true', `strict-ssl=true\n_auth=${TOKEN}`, '_auth'),
      edit('npmrc: strict-ssl drops', '.npmrc', 'strict-ssl=true', 'strict-ssl=false', 'strict-ssl'),
      write(
        'npmrc: a credential ships in a fresh file',
        '.npmrc',
        `//registry.npmjs.org/:_authToken=${TOKEN}`,
        '_authToken',
      ),
      write(
        '.pnpmfile: install-time code is human-written',
        '.pnpmfile.mjs',
        'export default () => ({})\n',
        'human-written',
      ),
      write(
        '.pnpmfile.cjs: install-time code is human-written',
        '.pnpmfile.cjs',
        'module.exports = {}\n',
        'human-written',
      ),
      write('workspace: a fresh file arrives weak', 'pnpm-workspace.yaml', `${AGE}: ${SHORT_QUARANTINE}\n`, AGE),
      write(
        'workspace: a fresh file arrives weak through Create',
        'pnpm-workspace.yaml',
        `${AGE}: ${SHORT_QUARANTINE}\n`,
        AGE,
        'Create',
      ),
      multi('multi: one weakening hunk among benign ones', 'pnpm-workspace.yaml', [
        { old_string: 'packages:\n  - packages/*', new_string: 'packages:\n  - packages/*\n  - tools/*' },
        { old_string: `${AGE}: ${QUARANTINE}`, new_string: `${AGE}: ${SHORT_QUARANTINE}` },
      ], AGE),
      morph('morph: an edits hunk weakens', 'pnpm-workspace.yaml', [
        { old_string: `${AGE}: ${QUARANTINE}`, new_string: `${AGE}: ${SHORT_QUARANTINE}` },
      ], AGE),
      morph(
        'morph: a file_edits hunk weakens',
        'pnpm-workspace.yaml',
        [
          { find: `${AGE}: ${QUARANTINE}`, replace: `${AGE}: ${SHORT_QUARANTINE}` },
        ],
        AGE,
        'file_edits',
      ),
      edit('workspace at depth: the age drops', nested, `${AGE}: ${QUARANTINE}`, `${AGE}: ${SHORT_QUARANTINE}`, AGE),
    ])
    await passes(project, [
      edit('workspace: the age rises', 'pnpm-workspace.yaml', `${AGE}: ${QUARANTINE}`, `${AGE}: ${LONG_QUARANTINE}`),
      edit(
        'workspace: a comment moves',
        'pnpm-workspace.yaml',
        `${AGE}: ${QUARANTINE}`,
        `${AGE}: ${QUARANTINE} # keep`,
      ),
      edit(
        'workspace: a catalog joins',
        'pnpm-workspace.yaml',
        'packages:\n  - packages/*',
        'packages:\n  - packages/*\ncatalogs:\n  default:\n    react: ^19',
      ),
      edit('workspace: replace_all stays benign', 'pnpm-workspace.yaml', 'packages:', 'packages: # packages', '', {
        replace_all: true,
      }),
      write('workspace: an identical rewrite', 'pnpm-workspace.yaml', DEFAULT_WORKSPACE),
      multi('multi: all hunks benign', 'pnpm-workspace.yaml', [
        { old_string: 'packages:\n  - packages/*', new_string: 'packages:\n  - packages/*\n  - tools/*' },
      ]),
      write('npmrc: a benign rewrite', '.npmrc', 'strict-ssl=true\nregistry=https://registry.npmjs.org/\n'),
      {
        label: '.pnpmfile: a contentless touch',
        cares: '',
        run: (project) => project.fileGuard('.pnpmfile.mjs', {}),
      },
      edit('an unrelated file', 'docs/notes.md', 'a', 'b'),
    ])
  })
})

Deno.test('a case-varied guarded name reaches the same decision', async () => {
  await withProject({ 'PNPM-Workspace.yaml': DEFAULT_WORKSPACE }, async (project) => {
    await refuses(project, [
      edit('case-varied workspace', 'PNPM-Workspace.yaml', `${AGE}: ${QUARANTINE}`, `${AGE}: ${SHORT_QUARANTINE}`, AGE),
    ])
  })
})

// ---------------------------------------------------------------------------
// The posture the guard defends is the one on disk, not the built-in default.
// ---------------------------------------------------------------------------

Deno.test('the declared posture on disk, not the pnpm default, is the comparison', async () => {
  await withProject({ 'pnpm-workspace.yaml': `${AGE}: ${LONG_QUARANTINE}\n` }, async (project) => {
    await refuses(project, [
      edit(
        'beats the default, weakens the project',
        'pnpm-workspace.yaml',
        `${AGE}: ${LONG_QUARANTINE}`,
        `${AGE}: ${QUARANTINE}`,
        `${LONG_QUARANTINE} -> ${QUARANTINE}`,
      ),
      refused(
        'the same drop through the CLI',
        `pnpm config set ${AGE} ${QUARANTINE}`,
        `${LONG_QUARANTINE} -> ${QUARANTINE}`,
      ),
    ])
    await passes(project, [
      edit(
        'restating the declared value',
        'pnpm-workspace.yaml',
        `${AGE}: ${LONG_QUARANTINE}`,
        `${AGE}: ${LONG_QUARANTINE}`,
      ),
      bash('a strengthening set', `pnpm config set ${AGE} ${String(20160)}`),
    ])
  })
})

// ---------------------------------------------------------------------------
// The command surfaces: same matrix, reached out-of-band.
// ---------------------------------------------------------------------------

Deno.test('every guarded command route refuses its weakening and passes its benign twin', async () => {
  await withProject({ 'pnpm-workspace.yaml': DEFAULT_WORKSPACE }, async (project) => {
    await refuses(project, [
      refused('config set', `pnpm config set ${AGE} ${SHORT_QUARANTINE}`, AGE),
      refused('config set, kebab spelling', `pnpm config set minimum-release-age ${SHORT_QUARANTINE}`, AGE),
      refused('config set, env spelling', `pnpm config set MINIMUM_RELEASE_AGE ${SHORT_QUARANTINE}`, AGE),
      refused('config delete', `pnpm config delete ${BLOCK_EXOTIC}`, BLOCK_EXOTIC),
      refused('config set in the kebab spelling of a held-true key', `pnpm config set strict-ssl ${OFF}`, 'strictSsl'),
      refused(
        'an auth token through the CLI',
        `pnpm config set //registry.npmjs.org/:_authToken ${TOKEN}`,
        '_authToken',
      ),
      refused('--config.<key>=<value>', `pnpm install --config.${STRICT_DEP}=${OFF}`, STRICT_DEP),
      refused('--config.<key> <value>', `pnpm install --config.${STRICT_DEP} ${OFF}`, STRICT_DEP),
      refused('--no-<key>', `pnpm install --no-${BLOCK_EXOTIC}`, BLOCK_EXOTIC),
      refused('--<key>=<value>', `pnpm install --${TRUST_LOCK}=true`, TRUST_LOCK),
      refused(
        '--dangerously-allow-all-builds',
        'pnpm install --dangerously-allow-all-builds',
        'dangerouslyAllowAllBuilds',
      ),
      refused('the env prefix form', `${'pnpm_config_'}${STRICT_DEP}=${OFF} pnpm install`, STRICT_DEP),
      refused('the canonical env spelling', `PNPM_CONFIG_${BLOCK_EXOTIC}=${OFF} pnpm install`, BLOCK_EXOTIC),
      refused('the export form', `export ${'pnpm_config_'}${STRICT_DEP}=${OFF} && pnpm install`, STRICT_DEP),
      refused('an env assignment handed to env', `env ${'pnpm_config_'}${STRICT_DEP}=${OFF} pnpm install`, STRICT_DEP),
      refused(
        'an env assignment handed to command',
        `command ${'pnpm_config_'}${BLOCK_EXOTIC}=${OFF} pnpm install`,
        BLOCK_EXOTIC,
      ),
      refused('approve-builds names a package', 'pnpm approve-builds esbuild', 'allowBuilds'),
      refused('a bare approve-builds is the grant-all prompt', 'pnpm approve-builds', 'approve-builds'),
      refused('a glob approve-builds', 'pnpm approve-builds *', 'wildcard'),
      refused('add --allow-build', 'pnpm add --allow-build=esbuild left-pad', 'allowBuilds'),
      refused('every name in a comma list', 'pnpm add --allow-build=esbuild,sharp left-pad', 'allowBuilds'),
      refused('a repeated flag', 'pnpm add --allow-build=esbuild --allow-build=sharp x', 'allowBuilds'),
      refused(
        'a substituted --allow-build value is wholesale',
        'pnpm add --allow-build=$(echo esbuild) left-pad',
        'wholesale',
      ),
      refused('audit --fix', 'pnpm audit --fix', 'audit --fix'),
      refused(
        'a retarget with --location global',
        `pnpm config set ${BLOCK_EXOTIC} ${OFF} --location global`,
        'outside the project',
      ),
      refused('a retarget with -C', `pnpm -C .. config set ${BLOCK_EXOTIC} ${OFF}`, 'outside the project'),
      refused(
        'a guarded flag write retargeted',
        `pnpm install --config.${AGE}=${LONG_QUARANTINE} -C ..`,
        'outside the project',
      ),
      refused('a substitution as a config value', `pnpm config set ${AGE} $(echo ${QUARANTINE})`, 'cannot verify'),
      refused('inside a pipeline', `cat lock | pnpm config set ${AGE} ${SHORT_QUARANTINE}`, AGE),
      refused('behind && and ||', `pnpm test || pnpm config set ${AGE} ${SHORT_QUARANTINE}`, AGE),
      refused('inside command substitution', `echo "$(pnpm config set ${AGE} ${SHORT_QUARANTINE})"`, AGE),
      refused('inside a subshell', `( pnpm config set ${AGE} ${SHORT_QUARANTINE} )`, AGE),
      refused('inside a loop body', `for i in 1; do pnpm config set ${AGE} ${SHORT_QUARANTINE}; done`, AGE),
      refused(
        'inside a for-in word list',
        `for i in $(pnpm config set ${AGE} ${SHORT_QUARANTINE}); do echo x; done`,
        AGE,
      ),
      refused('behind a redirect', `pnpm config set ${AGE} ${SHORT_QUARANTINE} > /dev/null`, AGE),
      refused('behind a global flag', `pnpm --reporter silent config set ${AGE} ${SHORT_QUARANTINE}`, AGE),
      refused('under corepack', `corepack pnpm config set ${AGE} ${SHORT_QUARANTINE}`, AGE),
      refused('under pn', `pn config set ${AGE} ${SHORT_QUARANTINE}`, AGE),
      refused(
        'a --config.<key> with a flag where the value goes',
        `pnpm install --config.${AGE} --frozen-lockfile`,
        'cannot verify',
      ),
    ])
    await passes(project, [
      bash('a frozen install', 'pnpm install --frozen-lockfile'),
      bash('a test run', 'pnpm test'),
      bash('a read-only audit', 'pnpm audit'),
      bash('a new scope registry is new-scope setup', `pnpm config set @fresh:registry https://registry.npmjs.org/`),
      bash('an over-block regression: --fixed-output', 'pnpm audit --fixed-output foo'),
      bash('an over-block regression: --fixme', 'pnpm audit --fixme'),
      bash('the audit help', 'pnpm audit --help'),
      bash('a strengthening config set', `pnpm config set ${AGE} ${LONG_QUARANTINE}`),
      bash('an unguarded key', 'pnpm config set verifyDepsBeforeRun error'),
      bash('an unguarded flag', 'pnpm install --foo=bar'),
      bash('an unguarded env assignment', 'pnpm_config_someUnknownSetting=1 pnpm install'),
      bash('a relaxed but unguarded grant', 'pnpm add --allow-build-unrelated=x left-pad'),
      bash('a non-pnpm command', 'cargo build --release && deno task test'),
      bash('a pnpm word that runs nothing', 'echo pnpm'),
      bash('a dynamic value in a read position', 'pnpm config get $(echo ' + AGE + ')'),
      bash('a malformed payload', ''),
    ])
  })
})

Deno.test('repointing a declared scope registry is refused; declaring a new one is not', async () => {
  const declared = `${AGE}: ${QUARANTINE}\nregistries:\n  "@scope": https://registry.npmjs.org/\n`
  await withProject({ 'pnpm-workspace.yaml': declared }, async (project) => {
    await refuses(project, [
      refused(
        'the declared scope is repointed',
        'pnpm config set @scope:registry https://elsewhere.example/',
        'registries["@scope"]',
      ),
    ])
    await passes(project, [
      bash('an undeclared scope is set up', 'pnpm config set @fresh:registry https://registry.npmjs.org/'),
    ])
  })
})

// ---------------------------------------------------------------------------
// The enforcement surface is human-only; doctrine and docs are not.
// ---------------------------------------------------------------------------

Deno.test('the guard vetoes its own enforcement surface and stays out of doctrine', async () => {
  await withProject({ 'pnpm-workspace.yaml': DEFAULT_WORKSPACE }, async (project) => {
    await refuses(project, [
      edit('the guard code', GUARD_SRC, 'a', 'b', 'human-edited'),
      edit('the plugin import map', 'agent-plugins/pnpm-guard/deno.jsonc', 'a', 'b', 'human-edited'),
      edit('the plugin import map, deno.json', 'agent-plugins/pnpm-guard/deno.json', 'a', 'b', 'human-edited'),
      edit('the plugin lockfile', 'agent-plugins/pnpm-guard/deno.lock', 'a', 'b', 'human-edited'),
      edit('the plugin manifest', 'agent-plugins/pnpm-guard/plugin.json', 'a', 'b', 'human-edited'),
      edit('the hook registration', 'agent-plugins/pnpm-guard/hooks/hooks.json', 'a', 'b', 'human-edited'),
      edit('a sibling guard', 'agent-plugins/oxlint-guard/src/guard-config.ts', 'a', 'b', 'human-edited'),
      edit('the in-repo hook', '.claude/hooks/guard-protected-writes.ts', 'a', 'b', 'human-edited'),
      edit('the in-repo settings', '.claude/settings.json', 'a', 'b', 'human-edited'),
      edit('the in-repo import map', '.claude/deno.jsonc', 'a', 'b', 'human-edited'),
      edit('the marketplace manifest', '.claude-plugin/marketplace.json', 'a', 'b', 'human-edited'),
      edit('a case-varied manifest name', 'agent-plugins/pnpm-guard/DENO.JSON', 'a', 'b', 'human-edited'),
    ])
    await passes(project, [
      edit('the plugin README', 'agent-plugins/pnpm-guard/README.md', 'a', 'b'),
      edit('the leaf doctrine', 'agent-plugins/AGENTS.md', 'a', 'b'),
      edit('the plan', 'docs/plans/2026-09-15-2244-feat-pnpm-guard-agent-plugin-plan.md', 'a', 'b'),
      edit('a near-miss config name', 'agent-plugins/pnpm-guard/deno.json.bak', 'a', 'b'),
      edit('a directory that merely starts with src', 'agent-plugins/pnpm-guard/srcfoo/guard.ts', 'a', 'b'),
      edit('a non-manifest beside the plugin', 'agent-plugins/pnpm-guard/CHANGELOG.md', 'a', 'b'),
      edit('a nested marketplace', '.claude-plugin/other/marketplace.json', 'a', 'b'),
      edit('a local settings file', '.claude/settings.local.json', 'a', 'b'),
    ])
  })
})

// ---------------------------------------------------------------------------
// Fail-closed: what the guard cannot verify on a guarded target it refuses,
// and a posture it cannot read is not a posture it may assume.
// ---------------------------------------------------------------------------

Deno.test('an unverifiable guarded edit or an unreadable posture is refused', async () => {
  await withProject({ 'pnpm-workspace.yaml': DEFAULT_WORKSPACE, '.npmrc': 'strict-ssl=true\n' }, async (project) => {
    await refuses(project, [
      edit(
        'a hunk that is not on disk',
        'pnpm-workspace.yaml',
        `${AGE}: ${LONG_QUARANTINE}`,
        `${AGE}: ${SHORT_QUARANTINE}`,
        'cannot verify',
      ),
      edit(
        'an empty old_string against content',
        'pnpm-workspace.yaml',
        '',
        `${AGE}: ${SHORT_QUARANTINE}`,
        'cannot verify',
      ),
      {
        label: 'a raw morph body',
        cares: 'cannot verify',
        run: (project) =>
          project.fileGuard('pnpm-workspace.yaml', { content: 'raw morph body' }, 'morph_mcp_edit-file'),
      },
      write('content that is not a mapping', 'pnpm-workspace.yaml', '- just\n- a list\n', 'cannot verify'),
      {
        label: 'an oversize payload',
        cares: 'cannot verify',
        run: () => runFileGuard({ tag: 'too-large' }, project.root),
      },
      bash('a substitution where the key goes', `pnpm config set $(echo ${AGE}) ${SHORT_QUARANTINE}`, 'cannot verify'),
    ])
    await passes(project, [
      bash('a payload that is not a hook payload', 'not json at all'),
      bash('a whitespace command', '   '),
    ])
  })
})

Deno.test('a posture the guard cannot read is refused, not assumed', async () => {
  // A directory where the posture file belongs: present to Deno.stat, and
  // unreadable as text — the fault sits at the real filesystem boundary.
  await withProject({ 'pnpm-workspace.yaml': DEFAULT_WORKSPACE }, async (project) => {
    await Deno.remove(join(project.root, 'pnpm-workspace.yaml'))
    await Deno.mkdir(join(project.root, 'pnpm-workspace.yaml'))
    await refuses(project, [
      edit(
        'an edit under an unreadable workspace',
        'pnpm-workspace.yaml',
        `${AGE}: ${QUARANTINE}`,
        `${AGE}: ${SHORT_QUARANTINE}`,
        'cannot verify',
      ),
      refused('a command under an unreadable workspace', `pnpm config set ${AGE} ${SHORT_QUARANTINE}`, 'cannot verify'),
    ])
    await passes(project, [
      bash('a non-pnpm command under an unreadable posture', 'cargo build'),
    ])
  })
})

// ---------------------------------------------------------------------------
// The transport: payload shapes the guard must not act on.
// ---------------------------------------------------------------------------

Deno.test('payloads outside the contract pass silently', async () => {
  await withProject({ 'pnpm-workspace.yaml': DEFAULT_WORKSPACE }, async (project) => {
    const raw = async (stdin: { tag: 'content'; content: string }): Promise<number> =>
      (await runFileGuard(stdin, project.root)).exit
    assertEquals(
      await raw({
        tag: 'content',
        content: JSON.stringify({
          tool_name: 'Read',
          tool_input: { file_path: join(project.root, 'pnpm-workspace.yaml') },
        }),
      }),
      0,
    )
    assertEquals(await raw({ tag: 'content', content: 'not json' }), 0)
    assertEquals(await raw({ tag: 'content', content: JSON.stringify({ tool_name: 'Edit', tool_input: {} }) }), 0)
    assertEquals(
      await raw({
        tag: 'content',
        content: JSON.stringify({
          tool_name: 'Edit',
          tool_input: { file_path: join(project.root, 'pnpm-workspace.yaml') },
        }),
      }),
      0,
    )
    assert((await runCommandGuard({ payload: '', reads: { workspaceYaml: () => '', npmrc: () => '' } })).exit === 0)
  })
})
