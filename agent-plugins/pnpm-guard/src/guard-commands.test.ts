// Behaviour tests for the pnpm-guard command guard (U5): the PreToolUse Bash
// hook's run surface, driven in-process (no process spawning). Every case is a
// raw hook payload plus the two posture documents the guard reads, and the
// observable is the exit contract: 2 with a message naming the act, or 0 with
// nothing on either stream.

import { assertEquals, assertStringIncludes } from '@std/assert'
import type { CommandGuardResult, CommandGuardSources } from './guard-commands.ts'
import { runCommandGuard } from './guard-commands.ts'

const bashPayload = (command: string): string => JSON.stringify({ tool_name: 'Bash', tool_input: { command } })

const run = (command: string, sources: CommandGuardSources = { workspaceYaml: '', npmrc: '' }): CommandGuardResult =>
  runCommandGuard({
    payload: bashPayload(command),
    reads: {
      workspaceYaml: () => sources.workspaceYaml,
      npmrc: () => sources.npmrc,
    },
  })

const runRaw = (payload: string, sources = { workspaceYaml: '', npmrc: '' }): CommandGuardResult =>
  runCommandGuard({
    payload,
    reads: { workspaceYaml: () => sources.workspaceYaml, npmrc: () => sources.npmrc },
  })

const assertBlocked = (command: string, sources: CommandGuardSources, expected: string): void => {
  const result = run(command, sources)
  assertEquals(result.exit, 2, `expected ${command} to be blocked; stderr: ${result.stderr}`)
  assertStringIncludes(result.stderr, expected, `${command}: stderr did not name ${expected}`)
}

const assertAllowed = (command: string, sources: CommandGuardSources = { workspaceYaml: '', npmrc: '' }): void => {
  const result = run(command, sources)
  assertEquals(result, { exit: 0, stderr: '' }, `expected ${command} to be allowed`)
}

const DEFAULT = { workspaceYaml: '', npmrc: '' }
// A project whose declared posture is stronger than pnpm 11's defaults: the R9
// case, where "5000" looks like a strengthening against 1440 and is a weakening
// against what this project actually declares.
const HARDENED = {
  workspaceYaml: [
    'minimumReleaseAge: 10080',
    'minimumReleaseAgeStrict: true',
    'blockExoticSubdeps: true',
    'strictDepBuilds: true',
    'trustPolicy: no-downgrade',
  ].join('\n') + '\n',
  npmrc: '',
}
const MID = { workspaceYaml: 'minimumReleaseAge: 5000\n', npmrc: '' }

// ---------------------------------------------------------------------------
// R9 — config set / config delete on guarded keys.
// ---------------------------------------------------------------------------

Deno.test('config set lowering minimumReleaseAge is blocked', () => {
  assertBlocked('pnpm config set minimumReleaseAge 0', DEFAULT, 'minimumReleaseAge')
})

Deno.test('kebab-case minimum-release-age hits the same decision', () => {
  assertBlocked('pnpm config set minimum-release-age 0', DEFAULT, 'minimumReleaseAge')
})

Deno.test('UPPER_SNAKE MINIMUM_RELEASE_AGE hits the same decision', () => {
  assertBlocked('pnpm config set MINIMUM_RELEASE_AGE 0', DEFAULT, 'minimumReleaseAge')
})

Deno.test('weakening below the declared posture is blocked even when it beats the default', () => {
  assertBlocked('pnpm config set minimumReleaseAge 5000', HARDENED, 'weakens pnpm')
})

Deno.test('raising minimumReleaseAge above the declared posture is allowed', () => {
  assertAllowed('pnpm config set minimumReleaseAge 10080', MID)
  assertAllowed('pnpm config set minimum-release-age 10080', MID)
})

Deno.test('restating minimumReleaseAge at its current effective value is allowed', () => {
  assertAllowed('pnpm config set minimumReleaseAge 1440', DEFAULT)
})

Deno.test('deleting an explicitly declared minimumReleaseAge is blocked with the policy verdict', () => {
  assertBlocked('pnpm config delete minimumReleaseAge', MID, 'weakens pnpm')
})

Deno.test('deleting a guarded setting is blocked: removals are a human edit', () => {
  assertBlocked('pnpm config delete blockExoticSubdeps', DEFAULT, 'removes a guarded setting')
  assertBlocked('pnpm config delete block-exotic-subdeps', DEFAULT, 'removes a guarded setting')
})

Deno.test('deleting an unguarded setting is allowed', () => {
  assertAllowed('pnpm config delete store-dir')
})

Deno.test('setting an unguarded key is allowed', () => {
  assertAllowed('pnpm config set verifyDepsBeforeRun error')
  assertAllowed('pnpm config set store-dir /tmp/pnpm-store')
})

Deno.test('the .npmrc spelling of a guarded key is blocked too', () => {
  assertBlocked('pnpm config set strict-ssl false', DEFAULT, 'strictSsl')
})

Deno.test('introducing an auth-token line through the CLI is blocked', () => {
  assertBlocked('pnpm config set //registry.npmjs.org/:_authToken secret', DEFAULT, '//registry.npmjs.org/:_authToken')
})

Deno.test('modifying an existing scope registry line is blocked', () => {
  assertBlocked(
    'pnpm config set @scope:registry https://evil.example.com/',
    { workspaceYaml: '', npmrc: '@scope:registry=https://npmjs.example.com/\n' },
    '@scope:registry',
  )
})

Deno.test('config get is a read: a dynamic value there never blocks', () => {
  assertAllowed('pnpm config get minimumReleaseAge $(echo 5)')
  assertAllowed('pnpm config get minimumReleaseAge $AGE')
})

Deno.test('a dynamic value in a guarded set position cannot be verified', () => {
  assertBlocked('pnpm config set minimumReleaseAge $(echo 0)', DEFAULT, 'cannot verify')
  assertBlocked('pnpm config set minimumReleaseAge $AGE', DEFAULT, 'cannot verify')
})

Deno.test('a dynamic key in a set position cannot be verified', () => {
  assertBlocked('pnpm config set $KEY 0', DEFAULT, 'cannot verify')
})

Deno.test('a dynamic value in an unguarded set position is allowed', () => {
  assertAllowed('pnpm config set store-dir $(mktemp -d)')
})

// ---------------------------------------------------------------------------
// R9 — writes retargeted out of the project.
// ---------------------------------------------------------------------------

Deno.test('a guarded write with --location global is blocked as a retarget', () => {
  assertBlocked('pnpm config set strictDepBuilds false --location global', DEFAULT, 'outside the project')
  assertBlocked('pnpm --location=global config delete blockExoticSubdeps', DEFAULT, 'outside the project')
})

Deno.test('a guarded write with -C/--dir is blocked as a retarget', () => {
  assertBlocked('pnpm -C .. config set trustPolicy off', HARDENED, 'outside the project')
  assertBlocked('pnpm -C.. config set trustPolicy off', HARDENED, 'outside the project')
  assertBlocked('pnpm --dir .. config set trustPolicy off', HARDENED, 'outside the project')
})

Deno.test('an unguarded write with --location global is not our surface', () => {
  assertAllowed('pnpm config set store-dir /tmp/store --location global')
})

// ---------------------------------------------------------------------------
// R9 — flag-shaped writes.
// ---------------------------------------------------------------------------

Deno.test('--config.<key>=false is blocked in weakening direction', () => {
  assertBlocked('pnpm i --config.strict-dep-builds=false', DEFAULT, 'strictDepBuilds')
})

Deno.test('--config.<key> <value> with a separate value token is blocked', () => {
  assertBlocked('pnpm install --config.strictDepBuilds false', DEFAULT, 'strictDepBuilds')
})

Deno.test('--no-<key> is blocked for a guarded key', () => {
  assertBlocked('pnpm install --no-block-exotic-subdeps', DEFAULT, 'blockExoticSubdeps')
})

Deno.test('--<key>=false is blocked for a guarded key', () => {
  assertBlocked('pnpm install --block-exotic-subdeps=false', DEFAULT, 'blockExoticSubdeps')
})

Deno.test('--dangerously-allow-all-builds is blocked', () => {
  assertBlocked('pnpm install --dangerously-allow-all-builds', DEFAULT, 'dangerouslyAllowAllBuilds')
})

Deno.test('flag-shaped writes to unguarded keys are allowed', () => {
  assertAllowed('pnpm install --frozen-lockfile')
  assertAllowed('pnpm install --frozen-lockfile=false')
  assertAllowed('pnpm test')
  assertAllowed('pnpm audit')
})

Deno.test('--config.<key> in strengthening direction is allowed', () => {
  assertAllowed('pnpm install --config.strictDepBuilds true')
  assertAllowed('pnpm install --config.minimumReleaseAge=20160', MID)
})

Deno.test('pointing the registry away from npmjs through the CLI is blocked', () => {
  assertBlocked('pnpm config set registry https://evil.example.com/', DEFAULT, 'registry')
})

Deno.test('deleting a guarded key in weakening direction carries the policy verdict', () => {
  assertBlocked('pnpm config delete trustPolicy', HARDENED, 'weakens pnpm')
})

// ---------------------------------------------------------------------------
// R9 — pnpm_config_* environment assignments.
// ---------------------------------------------------------------------------

Deno.test('a pnpm_config_ prefix assignment is blocked', () => {
  assertBlocked('pnpm_config_minimumReleaseAge=0 pnpm install', DEFAULT, 'minimumReleaseAge')
})

Deno.test('the canonical PNPM_CONFIG_ env spelling is blocked', () => {
  assertBlocked('PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm install', DEFAULT, 'minimumReleaseAge')
})

Deno.test('a lower-snake env name hits the same decision', () => {
  assertBlocked('pnpm_config_minimum_release_age=0 pnpm install', DEFAULT, 'minimumReleaseAge')
})

Deno.test('an env assignment blocks even with no pnpm command behind it', () => {
  assertBlocked('pnpm_config_minimumReleaseAge=0 node -v', DEFAULT, 'minimumReleaseAge')
})

Deno.test('the export form is blocked', () => {
  assertBlocked('export pnpm_config_trust_policy=off && pnpm i', HARDENED, 'trustPolicy')
})

Deno.test('a standalone export is blocked with no following pnpm command', () => {
  assertBlocked('export pnpm_config_block_exotic_subdeps=false', DEFAULT, 'blockExoticSubdeps')
})

Deno.test('a dynamic env value cannot be verified', () => {
  assertBlocked('pnpm_config_minimumReleaseAge=$AGE pnpm i', DEFAULT, 'cannot verify')
  assertBlocked('export pnpm_config_minimumReleaseAge=$AGE', DEFAULT, 'cannot verify')
})

Deno.test('a dynamic env name cannot be verified', () => {
  assertBlocked('pnpm_config_$KEY=0 pnpm install', DEFAULT, 'cannot verify')
})

Deno.test('an env assignment for an unguarded key is allowed', () => {
  assertAllowed('pnpm_config_store_dir=/tmp/store pnpm install')
  assertAllowed('pnpm_config_minimumReleaseAge=10080 pnpm install', MID)
})

// ---------------------------------------------------------------------------
// R9/R10 — build-script grants.
// ---------------------------------------------------------------------------

Deno.test('approve-builds naming a package is blocked', () => {
  assertBlocked('pnpm approve-builds esbuild', DEFAULT, 'allowBuilds')
  assertBlocked('pnpm approve-builds esbuild sharp', DEFAULT, 'allowBuilds')
})

Deno.test('a bare approve-builds is the grant-all prompt shape and is blocked', () => {
  assertBlocked('pnpm approve-builds', DEFAULT, 'build-script grant')
})

Deno.test('a glob in approve-builds is blocked as a grant-all', () => {
  assertBlocked('pnpm approve-builds *', DEFAULT, 'build-script grant')
})

Deno.test('approve-builds --help is not a grant', () => {
  assertAllowed('pnpm approve-builds --help')
})

Deno.test('add --allow-build=<pkg> is blocked', () => {
  assertBlocked('pnpm add --allow-build=esbuild left-pad', DEFAULT, 'allowBuilds')
})

Deno.test('every element of a comma-separated --allow-build list is blocked', () => {
  assertBlocked('pnpm add --allow-build=esbuild,sharp left-pad', DEFAULT, 'allowBuilds')
})

Deno.test('a repeated --allow-build flag is blocked on its first grant', () => {
  assertBlocked('pnpm add --allow-build=esbuild --allow-build=sharp left-pad', DEFAULT, 'allowBuilds')
})

Deno.test('add --allow-build with a separate value token is blocked', () => {
  assertBlocked('pnpm add --allow-build esbuild left-pad', DEFAULT, 'allowBuilds')
  assertBlocked('pnpm add --allow-build left-pad', DEFAULT, 'allowBuilds')
})

Deno.test('add --allow-build=* is blocked as a grant-all', () => {
  assertBlocked('pnpm add --allow-build=* left-pad', DEFAULT, 'build-script grant')
})

Deno.test('add --allow-build with no value is the grant-all prompt shape and is blocked', () => {
  assertBlocked('pnpm add --allow-build', DEFAULT, 'build-script grant')
  assertBlocked('pnpm add --allow-build=', DEFAULT, 'build-script grant')
})

Deno.test('a plain add is allowed', () => {
  assertAllowed('pnpm add left-pad')
  assertAllowed('pnpm add --save-dev left-pad')
})

// ---------------------------------------------------------------------------
// R9 — audit --fix.
// ---------------------------------------------------------------------------

Deno.test('audit --fix is blocked: it mints exclusion entries through pnpm', () => {
  assertBlocked('pnpm audit --fix', DEFAULT, 'audit --fix')
  assertBlocked('pnpm audit -f', DEFAULT, 'audit --fix')
})

Deno.test('a read-only audit is allowed', () => {
  assertAllowed('pnpm audit')
  assertAllowed('pnpm audit --audit-level high')
})

// ---------------------------------------------------------------------------
// R9 — recognition and nesting.
// ---------------------------------------------------------------------------

Deno.test('the pn, pnx and pnpx program names are recognised too', () => {
  assertBlocked('pn config set minimumReleaseAge 0', DEFAULT, 'minimumReleaseAge')
  assertBlocked('pnx install --dangerously-allow-all-builds', DEFAULT, 'dangerouslyAllowAllBuilds')
  assertBlocked('pnpx config delete blockExoticSubdeps', DEFAULT, 'removes a guarded setting')
})

Deno.test('corepack pnpm is recognised', () => {
  assertBlocked('corepack pnpm config set trustPolicy off', HARDENED, 'trustPolicy')
})

Deno.test('a guarded write inside a pipeline is reached', () => {
  assertBlocked('cat lockfile | pnpm config set minimumReleaseAge 0', DEFAULT, 'minimumReleaseAge')
})

Deno.test('a guarded write behind && and || is reached', () => {
  assertBlocked('pnpm install && pnpm config delete blockExoticSubdeps', DEFAULT, 'blockExoticSubdeps')
  assertBlocked('false || pnpm config set minimumReleaseAge 0', DEFAULT, 'minimumReleaseAge')
})

Deno.test('a guarded write inside command substitution is reached', () => {
  assertBlocked('echo $(pnpm config set minimumReleaseAge 0)', DEFAULT, 'minimumReleaseAge')
})

Deno.test('a guarded write inside a subshell is reached', () => {
  assertBlocked('(pnpm config set minimumReleaseAge 0)', DEFAULT, 'minimumReleaseAge')
})

Deno.test('a guarded write inside a loop or conditional body is reached', () => {
  assertBlocked('for i in 1 2; do pnpm config set minimumReleaseAge 0; done', DEFAULT, 'minimumReleaseAge')
  assertBlocked('if pnpm install; then pnpm config set minimumReleaseAge 0; fi', DEFAULT, 'minimumReleaseAge')
})

Deno.test('a global flag before the subcommand does not hide it', () => {
  assertBlocked('pnpm --filter workspace config set minimumReleaseAge 0', DEFAULT, 'minimumReleaseAge')
  assertBlocked('pnpm -C pkg config set minimumReleaseAge 0', DEFAULT, 'outside the project')
})

Deno.test('a redirect or comment does not hide the invocation', () => {
  assertBlocked('pnpm config set minimumReleaseAge 0 > /dev/null', DEFAULT, 'minimumReleaseAge')
  assertBlocked('pnpm config set minimumReleaseAge 0 # quiet', DEFAULT, 'minimumReleaseAge')
})

Deno.test('a weakening in the middle of a chain blocks the whole command', () => {
  assertBlocked('pnpm install && pnpm config set minimumReleaseAge 0 && pnpm test', DEFAULT, 'minimumReleaseAge')
})

// ---------------------------------------------------------------------------
// Payload and parse contract.
// ---------------------------------------------------------------------------

Deno.test('a non-Bash tool payload is allowed silently', () => {
  const edit = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: '/tmp/pnpm-workspace.yaml' } })
  assertEquals(runRaw(edit), { exit: 0, stderr: '' })
})

Deno.test('a malformed payload is allowed silently', () => {
  for (const payload of ['', 'not json', '[]', '"pnpm config set minimumReleaseAge 0"', '{}', 'null']) {
    assertEquals(runRaw(payload), { exit: 0, stderr: '' }, `payload ${JSON.stringify(payload)}`)
  }
  assertEquals(runRaw(JSON.stringify({ tool_name: 'Bash' })), { exit: 0, stderr: '' })
  assertEquals(runRaw(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 42 } })), { exit: 0, stderr: '' })
  assertEquals(runRaw(JSON.stringify({ tool_name: 'Bash', tool_input: { command: '' } })), { exit: 0, stderr: '' })
})

// ---------------------------------------------------------------------------
// Review pins: the argument shapes the matrix only reached after the fix.
// ---------------------------------------------------------------------------

Deno.test('a bare --<key>=<value> flag is a config write', () => {
  assertBlocked('pnpm install --trustLockfile=true', DEFAULT, 'trustLockfile')
  assertBlocked('pnpm install --minimum-release-age=0', DEFAULT, 'minimumReleaseAge')
  assertBlocked('pnpm install --block-exotic-subdeps=false', DEFAULT, 'blockExoticSubdeps')
})

Deno.test('a pnpm invocation inside a for-loop word list is reached', () => {
  assertBlocked('for i in $(pnpm config set minimumReleaseAge 0); do echo x; done', DEFAULT, 'minimumReleaseAge')
})

Deno.test('an environment assignment handed to a wrapper program is read', () => {
  assertBlocked('env pnpm_config_strictDepBuilds=false pnpm install', DEFAULT, 'strictDepBuilds')
  assertBlocked('command pnpm_config_blockExoticSubdeps=false pnpm install', DEFAULT, 'blockExoticSubdeps')
})

Deno.test('a --config.<key> whose next token is a flag is not verifiable', () => {
  assertBlocked('pnpm install --config.minimumReleaseAge --frozen-lockfile', DEFAULT, 'cannot verify')
})

Deno.test('a guarded --config write retargeted out of the project is blocked', () => {
  assertBlocked('pnpm install --config.minimumReleaseAge=10080 -C ..', DEFAULT, 'outside the project')
})

Deno.test('--fix-prefixed arguments that are not --fix are allowed', () => {
  assertAllowed('pnpm audit --fixed-output foo')
  assertAllowed('pnpm audit --fixme')
})

Deno.test('a posture read that fails is refused as unverifiable', () => {
  const result = runCommandGuard({
    payload: bashPayload('pnpm config set minimumReleaseAge 0'),
    reads: {
      workspaceYaml: () => {
        throw new Error('EACCES')
      },
      npmrc: () => '',
    },
  })
  assertEquals(result.exit, 2)
  assertStringIncludes(result.stderr, 'cannot verify')
})

Deno.test('non-pnpm commands are allowed silently', () => {
  assertAllowed('cargo build --release && deno task test')
  assertAllowed('git config set user.name "Someone"')
  assertAllowed('echo pnpm')
})

Deno.test('an unparseable script that names a pnpm-family program is blocked', () => {
  assertBlocked("pnpm config set 'minimumReleaseAge 0", DEFAULT, 'unparseable')
  assertBlocked('pnpm install "unterminated', DEFAULT, 'unparseable')
  assertBlocked('corepack pnpm install "unterminated', DEFAULT, 'unparseable')
})

Deno.test('an unparseable script without a pnpm-family word is allowed', () => {
  assertAllowed('echo "unterminated')
  assertAllowed('cargo build "unterminated')
})

Deno.test('a payload that is only whitespace is allowed', () => {
  assertAllowed('   ')
  assertAllowed('\n')
})
