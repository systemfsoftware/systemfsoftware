// template-callers keeps this repository's workflows that run the template equal
// to the template's own caller files. These tests write both under .context and
// read the verdict from the check itself.
import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { stringify } from '@std/yaml'
import { checkTemplateCallers } from './template-callers.ts'
import { Undecided, type Verdict } from './verdict.ts'

const HERE = dirname(fromFileUrl(import.meta.url))
const REPO = join(HERE, '..', '..', '..')
const SCRATCH = join(REPO, '.context', 'repo-checks-tests')

const SHA = '9d797f4c56f657af6d9782bd018f6a3c10acb984'
const OTHER = '0123456789abcdef0123456789abcdef01234567'

const REUSABLE = (stem: string, sha: string): string =>
  `systemfsoftware/systemfsoftware/.github/workflows/reusable-${stem}.yml@${sha}`

const NIGHTLY = ['schedule', 'workflow_dispatch'] as const

const ON: Record<string, readonly string[]> = {
  checks: ['pull_request', 'push'],
  commitlint: ['pull_request'],
  nix: ['pull_request', 'push'],
  mutation: NIGHTLY,
}

const PERMISSIONS: Record<string, Record<string, string>> = {
  checks: { contents: 'read', actions: 'read' },
  commitlint: { contents: 'read' },
  nix: { contents: 'read' },
  mutation: { contents: 'read', actions: 'write' },
}

const templateJob = (stem: string, sha: string): Record<string, unknown> => ({
  name: stem,
  permissions: PERMISSIONS[stem],
  uses: REUSABLE(stem, sha),
})

const templateFile = (stem: string, on: readonly string[], job: Record<string, unknown>): Record<string, unknown> => ({
  name: stem,
  on: Object.fromEntries(on.map((event) => [event, { branches: ['main'] }])),
  permissions: {},
  jobs: { [stem]: job },
})

const baseTemplate = (sha: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(ON).map(([stem, on]) => [stem, templateFile(stem, on, templateJob(stem, sha))]))

const call = (stem: string, sha: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: stem,
  permissions: PERMISSIONS[stem],
  uses: REUSABLE(stem, sha),
  with: {
    'working-directory': 'templates/consumer',
    ...(stem === 'checks' || stem === 'mutation' ? { record: `template-${stem}-timings` } : {}),
  },
  ...extra,
})

const nonCall = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  'runs-on': 'ubuntu-latest',
  steps: [],
  ...extra,
})

// The workflow adds the exempt inputs, the mutation refusal job, and the two
// proof jobs the check must ignore. The template's nightly mutation caller is
// mirrored in its own workflow (nightlyMirror), as the shipped tree does.
const baseWorkflow = (sha: string): Record<string, unknown> => ({
  'instantiate': nonCall(),
  'checks': call('checks', sha),
  'mutation-refuses-pull-request': nonCall({ if: "github.event_name == 'pull_request'" }),
  'commitlint': call('commitlint', sha, { if: "github.event_name == 'pull_request'" }),
  'nix': call('nix', sha),
  'template-ran': nonCall({ needs: ['instantiate'] }),
})

/** consumer-template.yml calling mutation on a push, the shape the nightly law moved out of it. */
const pushMutation = (sha: string): Record<string, unknown> => ({
  ...baseWorkflow(sha),
  mutation: call('mutation', sha, { if: "github.event_name == 'push'" }),
})

const workflowFile = (on: readonly string[], jobs: Record<string, unknown>): Record<string, unknown> => ({
  name: 'workflow',
  on: Object.fromEntries(on.map((event) => [event, {}])),
  permissions: {},
  jobs,
})

/** The nightly workflow that mirrors the template's mutation caller. */
const nightlyMirror = (sha: string): Record<string, Record<string, unknown>> => ({
  'consumer-template-mutation.yml': workflowFile(NIGHTLY, { mutation: call('mutation', sha) }),
})

/** Writes the template's callers, consumer-template.yml, and `others` (by default the nightly mirror). */
const write = async (
  template: Record<string, unknown>,
  workflow: Record<string, unknown>,
  others: Record<string, Record<string, unknown>> = nightlyMirror(SHA),
): Promise<string> => {
  await Deno.mkdir(SCRATCH, { recursive: true })
  const root = await Deno.makeTempDir({ dir: SCRATCH, prefix: 'callers-' })
  const dir = join(root, 'templates', 'consumer', '.github', 'workflows')
  await Deno.mkdir(dir, { recursive: true })
  for (const [stem, value] of Object.entries(template)) {
    const file = /\.ya?ml$/.test(stem) ? stem : `${stem}.yml`
    await Deno.writeTextFile(join(dir, file), stringify(value))
  }
  await Deno.mkdir(join(root, '.github', 'workflows'), { recursive: true })
  const workflows = { 'consumer-template.yml': workflowFile(['pull_request', 'push'], workflow), ...others }
  for (const [file, value] of Object.entries(workflows)) {
    await Deno.writeTextFile(join(root, '.github', 'workflows', file), stringify(value))
  }
  return root
}

const withChecksJob = (job: Record<string, unknown>): Record<string, unknown> => ({
  ...baseTemplate(SHA),
  checks: templateFile('checks', ON['checks']!, job),
})

const violationsOf = (verdict: Verdict): string => {
  assertEquals(verdict._tag, 'Violated')
  return verdict._tag === 'Violated' ? verdict.violations.join('\n') : ''
}

Deno.test('Should_Hold_When_TheWorkflowCallsMatchTheTemplate', async () => {
  const root = await write(baseTemplate(SHA), baseWorkflow(SHA))
  assertEquals((await checkTemplateCallers(root))._tag, 'Holds')
})

Deno.test('Should_NameTheAddedInput_When_OnlyTheTemplateCallerCarriesItInWith', async () => {
  const root = await write(
    withChecksJob({ ...templateJob('checks', SHA), with: { 'record-days': 3 } }),
    baseWorkflow(SHA),
  )
  const text = violationsOf(await checkTemplateCallers(root))
  assertStringIncludes(text, 'reusable-checks.yml')
  assertStringIncludes(text, 'record-days')
})

Deno.test('Should_NameTheWorkingDirectory_When_TheTemplateCallerCarriesAnInputOnlyTheWorkflowMayAdd', async () => {
  const root = await write(
    withChecksJob({ ...templateJob('checks', SHA), with: { 'working-directory': 'packages/slug' } }),
    baseWorkflow(SHA),
  )
  assertStringIncludes(
    violationsOf(await checkTemplateCallers(root)),
    'with.working-directory: the template caller carries it, but only the workflow adds it',
  )
})

Deno.test('Should_NameTheExtraJob_When_TheWorkflowCallsAReusableAtAnotherSha', async () => {
  const workflow = { ...baseWorkflow(SHA), 'checks-again': call('checks', OTHER) }
  const root = await write(baseTemplate(SHA), workflow)
  assertStringIncludes(
    violationsOf(await checkTemplateCallers(root)),
    `${
      REUSABLE('checks', OTHER)
    }: .github/workflows/consumer-template.yml's \`checks-again\` job calls it, but no template caller does`,
  )
})

Deno.test('Should_NameTheExtraJob_When_TheWorkflowCallsAnotherRepositorysWorkflow', async () => {
  const foreign = 'attacker/systemfsoftware/.github/workflows/reusable-checks.yml@main'
  const workflow = { ...baseWorkflow(SHA), 'foreign': { name: 'foreign', uses: foreign } }
  const root = await write(baseTemplate(SHA), workflow)
  assertStringIncludes(
    violationsOf(await checkTemplateCallers(root)),
    `${foreign}: .github/workflows/consumer-template.yml's \`foreign\` job`,
  )
})

Deno.test('Should_NameTheCallerFile_When_ItsJobIdIsNotItsFileStem', async () => {
  const template = baseTemplate(SHA)
  template['checks'] = { ...templateFile('checks', ON['checks']!, {}), jobs: { verify: templateJob('checks', SHA) } }
  const root = await write(template, baseWorkflow(SHA))
  assertStringIncludes(
    violationsOf(await checkTemplateCallers(root)),
    'checks.yml: its job id is `verify`, but the workflow calls it as `checks`',
  )
})

Deno.test('Should_FlagSecrets_When_OnlyTheWorkflowPassesOne', async () => {
  const workflow = baseWorkflow(SHA)
  workflow['checks'] = call('checks', SHA, { secrets: { 'turbo-token': '${{ secrets.TURBO_TOKEN }}' } })
  const root = await write(baseTemplate(SHA), workflow)
  assertStringIncludes(
    violationsOf(await checkTemplateCallers(root)),
    `reusable-checks.yml@${SHA}: secrets.turbo-token: template (none) vs workflow "\${{ secrets.TURBO_TOKEN }}"`,
  )
})

Deno.test('Should_FlagPermissions_When_TheWorkflowWidensOne', async () => {
  const workflow = baseWorkflow(SHA)
  workflow['checks'] = call('checks', SHA, { permissions: { contents: 'write', actions: 'read' } })
  const root = await write(baseTemplate(SHA), workflow)
  assertStringIncludes(
    violationsOf(await checkTemplateCallers(root)),
    `reusable-checks.yml@${SHA}: permissions.contents: template "read" vs workflow "write"`,
  )
})

Deno.test('Should_FlagUses_When_TheWorkflowCallsADifferentSha', async () => {
  const workflow = baseWorkflow(SHA)
  workflow['checks'] = call('checks', OTHER)
  const root = await write(baseTemplate(SHA), workflow)
  const text = violationsOf(await checkTemplateCallers(root))
  assertStringIncludes(text, 'reusable-checks.yml')
  assertStringIncludes(text, 'uses')
  assertStringIncludes(text, OTHER)
})

Deno.test('Should_Hold_When_OnlyTheExemptWithKeysDiffer', async () => {
  const workflow = baseWorkflow(SHA)
  workflow['checks'] = call('checks', SHA, {
    with: { 'working-directory': 'somewhere/else', record: 'other-timings' },
  })
  const root = await write(baseTemplate(SHA), workflow)
  assertEquals((await checkTemplateCallers(root))._tag, 'Holds')
})

Deno.test('Should_NameTheReusable_When_TheWorkflowHasNoCallForIt', async () => {
  const workflow = baseWorkflow(SHA)
  delete workflow['nix']
  const root = await write(baseTemplate(SHA), workflow)
  const text = violationsOf(await checkTemplateCallers(root))
  assertStringIncludes(text, 'reusable-nix.yml')
})

Deno.test('Should_Fail_When_TheWorkflowJobMissesTheTemplateTrigger', async () => {
  const workflow = baseWorkflow(SHA)
  workflow['commitlint'] = call('commitlint', SHA)
  const root = await write(baseTemplate(SHA), workflow)
  const text = violationsOf(await checkTemplateCallers(root))
  assertStringIncludes(text, 'reusable-commitlint.yml')
  assertStringIncludes(text, 'if')
})

Deno.test('Should_NameTheReusable_When_TheWorkflowCallsOneNoTemplateCallerDoes', async () => {
  const workflow = baseWorkflow(SHA)
  workflow['release'] = call('release', SHA, { permissions: { contents: 'read' } })
  const root = await write(baseTemplate(SHA), workflow)
  const text = violationsOf(await checkTemplateCallers(root))
  assertStringIncludes(text, 'reusable-release.yml')
  assertStringIncludes(text, 'no template caller')
})

Deno.test('Should_CompareTheCaller_When_ItsFileEndsInYaml', async () => {
  const { commitlint, ...rest } = baseTemplate(SHA)
  const workflow = baseWorkflow(SHA)
  workflow['commitlint'] = call('commitlint', OTHER, { if: "github.event_name == 'pull_request'" })
  const root = await write({ ...rest, 'commitlint.yaml': commitlint }, workflow)
  const text = violationsOf(await checkTemplateCallers(root))
  assertStringIncludes(
    text,
    `reusable-commitlint.yml@${SHA}: uses: template "${REUSABLE('commitlint', SHA)}" vs workflow "${
      REUSABLE('commitlint', OTHER)
    }"`,
  )
  assertEquals(text.includes('no template caller does'), false)
})

Deno.test('Should_FlagTheTrigger_When_TheCallerHasThreeEvents', async () => {
  const template = {
    ...baseTemplate(SHA),
    checks: templateFile('checks', ['pull_request', 'push', 'workflow_dispatch'], templateJob('checks', SHA)),
  }
  const root = await write(template, baseWorkflow(SHA))
  const text = violationsOf(await checkTemplateCallers(root))
  assertStringIncludes(text, 'reusable-checks.yml')
  assertStringIncludes(text, 'has no supported workflow trigger')
})

Deno.test('Should_Hold_When_TheCallerOnIsAScalarEvent', async () => {
  const template = {
    ...baseTemplate(SHA),
    checks: { ...templateFile('checks', ['push'], templateJob('checks', SHA)), on: 'push' },
  }
  const workflow = baseWorkflow(SHA)
  workflow['checks'] = call('checks', SHA, { if: "github.event_name == 'push'" })
  const root = await write(template, workflow)
  assertEquals((await checkTemplateCallers(root))._tag, 'Holds')
})

Deno.test('Should_BeUndecided_When_ACallerFileDeclaresTwoJobs', async () => {
  const template = {
    ...baseTemplate(SHA),
    checks: { ...templateFile('checks', ON['checks']!, templateJob('checks', SHA)), jobs: { checks: {}, other: {} } },
  }
  const root = await write(template, baseWorkflow(SHA))
  await assertRejects(() => checkTemplateCallers(root), Undecided, 'expected exactly one job, found 2')
})

Deno.test('Should_BeUndecided_When_ACallerOnIsAList', async () => {
  const template = {
    ...baseTemplate(SHA),
    checks: { ...templateFile('checks', ON['checks']!, templateJob('checks', SHA)), on: ['push'] },
  }
  const root = await write(template, baseWorkflow(SHA))
  await assertRejects(() => checkTemplateCallers(root), Undecided, '`on:` is not an event set')
})

Deno.test('Should_BeUndecided_When_NoWorkflowRunsTheTemplate', async () => {
  const root = await write(baseTemplate(SHA), baseWorkflow(SHA), {})
  await Deno.remove(join(root, '.github', 'workflows', 'consumer-template.yml'))
  await assertRejects(() => checkTemplateCallers(root), Undecided, 'no workflow under')
})

Deno.test('Should_CompareTheMirror_When_ItSpellsTheTemplateDirectoryAnotherWay', async () => {
  for (const directory of ['templates/consumer/', './templates/consumer']) {
    const mirror = call('mutation', OTHER, { with: { 'working-directory': directory } })
    const root = await write(baseTemplate(SHA), baseWorkflow(SHA), {
      'consumer-template-mutation.yml': workflowFile(NIGHTLY, { mutation: mirror }),
    })
    assertStringIncludes(
      violationsOf(await checkTemplateCallers(root)),
      `reusable-mutation.yml@${SHA}: uses: template "${REUSABLE('mutation', SHA)}" vs workflow "${
        REUSABLE('mutation', OTHER)
      }"`,
    )
  }
})

Deno.test('Should_NameTheWorkflowTriggers_When_ANightlyCallerIsMirroredByThePushWorkflow', async () => {
  const root = await write(baseTemplate(SHA), pushMutation(SHA), {})
  assertStringIncludes(
    violationsOf(await checkTemplateCallers(root)),
    'on: ["schedule","workflow_dispatch"] has no supported workflow trigger in .github/workflows/consumer-template.yml',
  )
})

Deno.test('Should_NameBothWorkflows_When_TwoCallTheTemplateCallersId', async () => {
  const root = await write(baseTemplate(SHA), pushMutation(SHA))
  assertStringIncludes(
    violationsOf(await checkTemplateCallers(root)),
    `reusable-mutation.yml@${SHA}: 2 workflows call it as \`mutation\` (.github/workflows/consumer-template-mutation.yml, .github/workflows/consumer-template.yml); exactly one may`,
  )
})

Deno.test('Should_NameTheNightlyWorkflowsExtraJob_When_NoTemplateCallerHasItsId', async () => {
  const nightly = nightlyMirror(SHA)['consumer-template-mutation.yml']!
  const jobs = { ...(nightly['jobs'] as Record<string, unknown>), 'mutation-again': call('mutation', OTHER) }
  const root = await write(baseTemplate(SHA), baseWorkflow(SHA), {
    'consumer-template-mutation.yml': { ...nightly, jobs },
  })
  assertStringIncludes(
    violationsOf(await checkTemplateCallers(root)),
    `${
      REUSABLE('mutation', OTHER)
    }: .github/workflows/consumer-template-mutation.yml's \`mutation-again\` job calls it, but no template caller does`,
  )
})

Deno.test('Should_Hold_When_AWorkflowCallsAReusableOnAnotherWorkspace', async () => {
  const fixture = workflowFile(['push'], {
    mutation: { uses: './.github/workflows/reusable-mutation.yml', with: { 'working-directory': '.github/fixture' } },
  })
  const root = await write(baseTemplate(SHA), baseWorkflow(SHA), {
    ...nightlyMirror(SHA),
    'consumer-fixture.yml': fixture,
  })
  assertEquals((await checkTemplateCallers(root))._tag, 'Holds')
})
