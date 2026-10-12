import { assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { decide, decideFromJson, type Facts, renderMarkdown, shellQuote } from './red-main.ts'

const here = dirname(fromFileUrl(import.meta.url))

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const C = 'c'.repeat(40)
const P = 'f'.repeat(40)
const X = 'e'.repeat(40)

const success = () => ({ status: 'completed', conclusion: 'success' })
const failure = () => ({ status: 'completed', conclusion: 'failure' })

const facts = (over: Partial<Facts> = {}): Facts => ({
  repository: 'owner/repo',
  defaultBranch: 'main',
  workflowRef: 'owner/repo/.github/workflows/ci.yml@refs/heads/main',
  commit: { sha: C, message: 'feat: add thing' },
  firstParents: [P],
  runs: { [P]: success() },
  failedJobs: [{ job: 'test-3', name: 'test · x', reason: 'test-failed' }],
  pr: { number: 12, author: 'octocat', mergedBy: 'merger' },
  prLookup: 'ok',
  ...over,
})

Deno.test('AE1: A is the culprit; B and C are already red since A', () => {
  const runs = { [B]: failure(), [A]: failure(), [X]: success() }
  const a = decide(facts({ commit: { sha: A, message: 'feat: a' }, firstParents: [X], runs }))
  assertEquals(a.verdict, 'culprit')
  const b = decide(facts({ commit: { sha: B, message: 'feat: b' }, firstParents: [A, X], runs }))
  assertEquals(b.verdict, 'already-red')
  assertEquals(b.firstRed, A)
  assertEquals(b.firstRedExact, true)
  assertStringIncludes(b.message, `main already red since ${A}`)
  const c = decide(facts({ commit: { sha: C, message: 'feat: c' }, firstParents: [B, A, X], runs }))
  assertEquals(c.verdict, 'already-red')
  assertEquals(c.firstRed, A)
  assertStringIncludes(c.message, `main already red since ${A}`)
})

Deno.test('AE2: a parent run still in progress is undecided', () => {
  const result = decide(facts({ firstParents: [P], runs: { [P]: { status: 'in_progress', conclusion: null } } }))
  assertEquals(result.verdict, 'undecided')
  assertEquals(result.reason, 'parent-run-in-progress')
})

Deno.test('AE3: install-failed is a culprit with no verdict reason; a verdict reason only when one is present', () => {
  const installOnly = decide(facts({ failedJobs: [{ job: 'a', name: 'a', reason: 'install-failed' }] }))
  assertEquals(installOnly.verdict, 'culprit')
  assertEquals(installOnly.verdictReason, false)
  const mixed = decide(
    facts({
      failedJobs: [{ job: 'a', name: 'a', reason: 'install-failed' }, { job: 'b', name: 'b', reason: 'test-failed' }],
    }),
  )
  assertEquals(mixed.verdict, 'culprit')
  assertEquals(mixed.verdictReason, true)
  const unclassified = decide(facts({ failedJobs: [{ job: 'a', name: 'a', reason: 'unclassified' }] }))
  assertEquals(unclassified.verdictReason, false)
})

Deno.test('AE13: hook-infra-failed is not a verdict; hook-verdict-failed is', () => {
  assertEquals(
    decide(facts({ failedJobs: [{ job: 'h', name: 'h', reason: 'hook-infra-failed' }] })).verdictReason,
    false,
  )
  assertEquals(
    decide(facts({ failedJobs: [{ job: 'h', name: 'h', reason: 'hook-verdict-failed' }] })).verdictReason,
    true,
  )
})

Deno.test('AE4: revert subjects and a Reverts trailer are flagged; a revert word elsewhere is not', () => {
  for (
    const subject of [
      'revert(vitest): restore the shared vitest config',
      'revert!: x',
      'Revert "feat: x"',
    ]
  ) {
    assertEquals(decide(facts({ commit: { sha: C, message: subject } })).isRevert, true, subject)
  }
  assertEquals(
    decide(facts({ commit: { sha: C, message: 'fix: y\n\nReverts: 0123456789abcdef' } })).isRevert,
    true,
  )
  assertEquals(decide(facts({ commit: { sha: C, message: 'feat: revert button' } })).isRevert, false)
})

Deno.test('AE14: no run on the first parent is undecided even with a pass five commits back', () => {
  const parents = [P, '1'.repeat(40), '2'.repeat(40), '3'.repeat(40), '4'.repeat(40), X]
  const result = decide(facts({ firstParents: parents, runs: { [X]: success() } }))
  assertEquals(result.verdict, 'undecided')
  assertEquals(result.reason, 'parent-run-missing')
})

Deno.test('AE15: the callee reusable workflow yields culprit-workflow-unknown', () => {
  for (
    const file of [
      'reusable-checks.yml',
      'reusable-nix.yml',
      'reusable-commitlint.yml',
      'reusable-mutation.yml',
    ]
  ) {
    const result = decide(facts({ workflowRef: `owner/repo/.github/workflows/${file}@refs/heads/main` }))
    assertEquals(result.verdict, 'undecided', file)
    assertEquals(result.reason, 'culprit-workflow-unknown', file)
    assertEquals(result.workflow, file)
  }
})

Deno.test('the workflow file is the basename after .github/workflows/ with @ and its tail dropped', () => {
  assertEquals(
    decide(facts({ workflowRef: 'systemfsoftware/systemfsoftware/.github/workflows/ci.yml@refs/heads/main' })).workflow,
    'ci.yml',
  )
  assertEquals(decide(facts({ workflowRef: 'owner/repo/.github/workflows/nix.yml@0123abc' })).workflow, 'nix.yml')
  assertEquals(
    decide(facts({ workflowRef: 'owner/repo/.github/workflows/reusable-checks.yml@refs/heads/main' })).reason,
    'culprit-workflow-unknown',
  )
  assertEquals(decide(facts({ workflowRef: 'not-a-workflow-ref' })).reason, 'culprit-workflow-unknown')
})

Deno.test('AE16: no associated PR yields the notice and still yields the revert command', () => {
  const result = decide(facts({ pr: null, prLookup: 'none' }))
  assertEquals(result.verdict, 'culprit')
  assertEquals(result.pr, null)
  assertStringIncludes(result.notices.join(' '), 'no associated pull request')
  assertEquals(result.revert !== null, true)
  assertStringIncludes(result.revert!.git, 'git revert --no-commit')
  assertStringIncludes(result.revert!.ghPr, 'gh pr create -R owner/repo')
})

Deno.test('the culprit revert command carries the Reverts: <C> trailer', () => {
  const result = decide(facts())
  assertEquals(result.verdict, 'culprit')
  assertStringIncludes(result.revert!.git, `-m 'Reverts: ${C}'`)
  assertStringIncludes(result.revert!.git, `git fetch origin main && git switch -c revert-${C.slice(0, 7)} origin/main`)
  assertStringIncludes(result.revert!.ghPr, `--head revert-${C.slice(0, 7)}`)
})

Deno.test('walk 2 stopping at a commit with no run says since at or before <last failed>', () => {
  const result = decide(facts({ firstParents: [P, '9'.repeat(40)], runs: { [P]: failure() } }))
  assertEquals(result.verdict, 'already-red')
  assertEquals(result.firstRed, P)
  assertEquals(result.firstRedExact, false)
  assertStringIncludes(result.message, `main already red since at or before ${P}`)
})

Deno.test('a hostile subject is quoted so bash accepts the commands and passes it through verbatim', async () => {
  const subject = "feat: don't $(id) `whoami`"
  const result = decide(facts({ commit: { sha: C, message: subject } }))
  const revert = result.revert
  assertEquals(revert !== null, true)
  for (const command of [revert!.git, revert!.ghPr]) {
    const check = await new Deno.Command('bash', { args: ['-n', '-c', command] }).output()
    assertEquals(check.code, 0, `bash -n rejected: ${command}`)
  }
  const revertSubject = `revert: ${subject}`
  assertStringIncludes(revert!.git, shellQuote(revertSubject))
  const printed = await new Deno.Command('bash', { args: ['-c', `printf %s ${shellQuote(revertSubject)}`] }).output()
  assertEquals(new TextDecoder().decode(printed.stdout), revertSubject)
})

Deno.test('a refused PR read falls back to the number in the subject and names the refusal', () => {
  const result = decide(facts({ commit: { sha: C, message: 'feat: x (#42)' }, pr: null, prLookup: 'refused' }))
  assertEquals(result.verdict, 'culprit')
  assertEquals(result.pr, { number: 42, author: null, mergedBy: null })
  assertStringIncludes(result.notices.join(' '), 'refused')
})

Deno.test('facts that cannot be parsed are undecided with culprit-lookup-failed', () => {
  assertEquals(decideFromJson(undefined).verdict, 'undecided')
  assertEquals(decideFromJson(undefined).reason, 'culprit-lookup-failed')
  assertEquals(decideFromJson({ repository: 'owner/repo' }).reason, 'culprit-lookup-failed')
  assertEquals(decideFromJson(facts()).verdict, 'culprit')
})

Deno.test('the markdown fenced the subject and de-mentions at signs', () => {
  const result = decide(
    facts({
      commit: { sha: C, message: 'feat: ping @octocat' },
      pr: { number: 12, author: 'octocat', mergedBy: null },
    }),
  )
  const markdown = renderMarkdown(result)
  assertStringIncludes(markdown, 'verdict: culprit')
  assertStringIncludes(markdown, '@\u200b')
  assertEquals(markdown.includes('@octocat'), false)
  assertStringIncludes(markdown, C)
  assertStringIncludes(markdown, '### revert')
  assertStringIncludes(markdown, '```')
})

Deno.test('CLI writes the data JSON, the markdown summary and the GITHUB_OUTPUT line, and exits 0', async () => {
  const dir = await Deno.makeTempDir()
  const factsFile = join(dir, 'facts.json')
  const outFile = join(dir, 'out.json')
  const outputFile = join(dir, 'github-output')
  const summaryFile = join(dir, 'summary.md')
  await Deno.writeTextFile(factsFile, JSON.stringify(facts()))
  await Deno.writeTextFile(outputFile, '')
  await Deno.writeTextFile(summaryFile, '')
  const args = [
    'run',
    `--config=${join(here, '..', 'deno.jsonc')}`,
    `--lock=${join(here, '..', 'deno.lock')}`,
    '--frozen',
    '--allow-read',
    '--allow-write',
    '--allow-env',
    join(here, 'red-main.ts'),
    '--facts',
    factsFile,
    '--out',
    outFile,
  ]
  const out = await new Deno.Command(Deno.execPath(), {
    args,
    env: { GITHUB_OUTPUT: outputFile, GITHUB_STEP_SUMMARY: summaryFile },
    stdout: 'piped',
  }).output()
  assertEquals(out.code, 0)
  const data = JSON.parse(await Deno.readTextFile(outFile))
  assertEquals(data.verdict, 'culprit')
  assertEquals(data.version, 1)
  assertEquals(await Deno.readTextFile(outputFile), 'verdict=culprit\n')
  assertStringIncludes(await Deno.readTextFile(summaryFile), 'red-main')
  await Deno.remove(dir, { recursive: true })
})
