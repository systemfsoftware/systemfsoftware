// template-callers keeps this repository's consumer-template workflow equal to
// the template's own caller files. These tests write both under .context and
// read the verdict from the check itself.
import { assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { stringify } from '@std/yaml'
import { checkTemplateCallers } from './template-callers.ts'
import type { Verdict } from './verdict.ts'

const HERE = dirname(fromFileUrl(import.meta.url))
const REPO = join(HERE, '..', '..', '..')
const SCRATCH = join(REPO, '.context', 'repo-checks-tests')

const SHA = '9d797f4c56f657af6d9782bd018f6a3c10acb984'
const OTHER = '0123456789abcdef0123456789abcdef01234567'

const REUSABLE = (stem: string, sha: string): string =>
  `systemfsoftware/systemfsoftware/.github/workflows/reusable-${stem}.yml@${sha}`

const ON: Record<string, readonly string[]> = {
  checks: ['pull_request', 'push'],
  commitlint: ['pull_request'],
  nix: ['pull_request', 'push'],
  mutation: ['push'],
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
// proof jobs the check must ignore.
const baseWorkflow = (sha: string): Record<string, unknown> => ({
  'instantiate': nonCall(),
  'checks': call('checks', sha),
  'mutation': call('mutation', sha, { if: "github.event_name == 'push'" }),
  'mutation-refuses-pull-request': nonCall({ if: "github.event_name == 'pull_request'" }),
  'commitlint': call('commitlint', sha, { if: "github.event_name == 'pull_request'" }),
  'nix': call('nix', sha),
  'template-ran': nonCall({ needs: ['instantiate'] }),
})

const write = async (template: Record<string, unknown>, workflow: Record<string, unknown>): Promise<string> => {
  await Deno.mkdir(SCRATCH, { recursive: true })
  const root = await Deno.makeTempDir({ dir: SCRATCH, prefix: 'callers-' })
  const dir = join(root, 'templates', 'consumer', '.github', 'workflows')
  await Deno.mkdir(dir, { recursive: true })
  for (const [stem, value] of Object.entries(template)) {
    const file = /\.ya?ml$/.test(stem) ? stem : `${stem}.yml`
    await Deno.writeTextFile(join(dir, file), stringify(value))
  }
  await Deno.mkdir(join(root, '.github', 'workflows'), { recursive: true })
  await Deno.writeTextFile(
    join(root, '.github', 'workflows', 'consumer-template.yml'),
    stringify({ name: 'Consumer template', on: { pull_request: {}, push: {} }, permissions: {}, jobs: workflow }),
  )
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
  assertStringIncludes(text, 'reusable-commitlint.yml')
  assertStringIncludes(text, OTHER)
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
