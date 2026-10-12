// The consumer template's caller files are the reference for this repository's
// consumer-template workflow. Each call must match in `uses`, `with` (minus the
// two keys the workflow adds), `secrets`, `permissions`, and trigger: the
// template file's `on:` event set maps to the workflow job's `if:`. In reverse,
// every workflow job that calls a `reusable-<name>` workflow needs a template
// caller for it. Non-call jobs and the workflow's own `on:`/`paths` are outside
// the comparison; only a job calling a `reusable-<name>` workflow the template
// has no caller for is a violation.
import { basename, join } from '@std/path'
import { parse } from '@std/yaml'
import { holds, Undecided, type Verdict, violated } from './verdict.ts'

type Job = Readonly<Record<string, unknown>>

/** `with:` keys the workflow adds, which the template's callers do not carry. */
const EXEMPT_WITH = ['working-directory', 'record'] as const

/** The workflow `if:` a template file's `on:` event set maps to; undefined when no set matches. */
const expectedIf = (events: readonly string[]): string | null | undefined => {
  if (events.length === 2 && events.includes('pull_request') && events.includes('push')) return null
  if (events.length === 1 && events[0] === 'pull_request') return "github.event_name == 'pull_request'"
  if (events.length === 1 && events[0] === 'push') return "github.event_name == 'push'"
  return undefined
}

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner) =>
    typeof inner === 'object' && inner !== null && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner)

const show = (value: unknown): string => (value === undefined ? '(none)' : canonical(value))

const mapping = (value: unknown, label: string): Record<string, unknown> => {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) throw new Undecided(`${label} is not a mapping`)
  return { ...(value as Record<string, unknown>) }
}

const mappingDiffs = (label: string, template: unknown, workflow: unknown): readonly string[] => {
  const left = mapping(template, `template ${label}`)
  const right = mapping(workflow, `workflow ${label}`)
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()
  return keys
    .filter((key) => canonical(left[key]) !== canonical(right[key]))
    .map((key) => `${label}.${key}: template ${show(left[key])} vs workflow ${show(right[key])}`)
}

const stripExempt = (job: Job): Record<string, unknown> => {
  const value = mapping(job['with'], 'caller `with:`')
  for (const key of EXEMPT_WITH) delete value[key]
  return value
}

/** Every difference between a template caller and the workflow's same-id job, each prefixed with the reusable. */
const compareCall = (
  reusable: string,
  templateJob: Job,
  workflowJob: Job | undefined,
  events: readonly string[],
): readonly string[] => {
  if (workflowJob === undefined || typeof workflowJob['uses'] !== 'string') {
    return [`${reusable}: the workflow has no call job`]
  }
  const lines: string[] = []
  if (templateJob['uses'] !== workflowJob['uses']) {
    lines.push(`uses: template ${show(templateJob['uses'])} vs workflow ${show(workflowJob['uses'])}`)
  }
  lines.push(...mappingDiffs('with', stripExempt(templateJob), stripExempt(workflowJob)))
  lines.push(...mappingDiffs('secrets', templateJob['secrets'], workflowJob['secrets']))
  lines.push(...mappingDiffs('permissions', templateJob['permissions'], workflowJob['permissions']))
  const expected = expectedIf(events)
  const actual = workflowJob['if'] === undefined ? null : String(workflowJob['if'])
  if (expected === undefined) {
    lines.push(`on: ${JSON.stringify([...events].sort())} has no supported workflow trigger`)
  } else if (expected !== actual) {
    lines.push(`if: template maps to ${show(expected)} but the workflow sets ${show(actual)}`)
  }
  return lines.map((line) => `${reusable}: ${line}`)
}

export const parseCallerYaml = (text: string, name: string): Record<string, unknown> => {
  let doc: unknown
  try {
    doc = parse(text)
  } catch (cause) {
    throw new Undecided(`${name}: unparseable YAML - ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) throw new Undecided(`${name}: not a mapping`)
  return doc as Record<string, unknown>
}

export const callerJob = (doc: Record<string, unknown>, name: string): Job => {
  const declared = mapping(doc['jobs'], `${name} \`jobs:\``)
  const ids = Object.keys(declared)
  if (ids.length !== 1) throw new Undecided(`${name}: expected exactly one job, found ${ids.length}`)
  return mapping(declared[ids[0]!], `${name} job \`${ids[0]!}\``)
}

const parseYamlFile = async (path: string, name: string): Promise<Record<string, unknown>> => {
  let text: string
  try {
    text = await Deno.readTextFile(path)
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) throw new Undecided(`${name}: missing`)
    throw cause
  }
  return parseCallerYaml(text, name)
}

/** One caller file under the template's workflows directory. */
export interface CallerFile {
  /** The file name without its extension: the caller's job id in the workflow. */
  readonly stem: string
  /** The repo-relative path. */
  readonly name: string
}

const CALLER_EXTENSION = /\.ya?ml$/

/** Every `.yml`/`.yaml` file in templates/consumer/.github/workflows, sorted; a missing directory is undecided. */
export const templateCallerFiles = async (root: string): Promise<readonly CallerFile[]> => {
  const relative = join('templates', 'consumer', '.github', 'workflows')
  const files: CallerFile[] = []
  try {
    for await (const entry of Deno.readDir(join(root, relative))) {
      if (entry.isFile && CALLER_EXTENSION.test(entry.name)) {
        files.push({ stem: entry.name.replace(CALLER_EXTENSION, ''), name: join(relative, entry.name) })
      }
    }
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) throw new Undecided(`${relative}: missing`)
    throw cause
  }
  return files.sort((a, b) => a.name.localeCompare(b.name))
}

/** The called workflow's file name, `reusable-checks.yml` for `owner/repo/.github/workflows/reusable-checks.yml@<ref>`. */
const calledFile = (uses: unknown): string | null =>
  typeof uses === 'string' && uses.length > 0 ? basename(uses.replace(/@.*$/, '')) : null

const REUSABLE_FILE = /^reusable-.+\.ya?ml$/

const eventsOf = (file: Record<string, unknown>, name: string): readonly string[] => {
  const on = file['on']
  if (typeof on === 'string') return [on]
  if (typeof on === 'object' && on !== null && !Array.isArray(on)) return Object.keys(on)
  throw new Undecided(`${name}: \`on:\` is not an event set`)
}

export const checkTemplateCallers = async (root: string): Promise<Verdict> => {
  const workflowName = '.github/workflows/consumer-template.yml'
  const files = await templateCallerFiles(root)
  const workflow = await parseYamlFile(join(root, workflowName), workflowName)
  const jobs = mapping(workflow['jobs'], `${workflowName} \`jobs:\``)
  const violations: string[] = []
  const reusables: string[] = []
  const called = new Set<string>()
  for (const { stem, name } of files) {
    const file = await parseYamlFile(join(root, name), name)
    const templateJob = callerJob(file, name)
    const uses = templateJob['uses']
    const reusable = typeof uses === 'string' && uses.length > 0 ? basename(uses) : `${stem}.yml`
    reusables.push(reusable)
    const target = calledFile(uses)
    if (target !== null) called.add(target)
    violations.push(...compareCall(reusable, templateJob, jobs[stem] as Job | undefined, eventsOf(file, name)))
  }
  for (const [id, job] of Object.entries(jobs)) {
    const target = calledFile(mapping(job, `${workflowName} job \`${id}\``)['uses'])
    if (target !== null && REUSABLE_FILE.test(target) && !called.has(target)) {
      violations.push(`${target}: the workflow's \`${id}\` job calls it, but no template caller does`)
    }
  }
  if (violations.length === 0) return holds(`${reusables.length} template caller(s) match the workflow's calls`)
  return violated(
    violations,
    'The consumer-template workflow must call each reusable exactly as the template does, apart from the `working-directory` and `record` inputs it adds, and call no reusable the template does not. Next: make the two call sites equal (R14).',
  )
}
