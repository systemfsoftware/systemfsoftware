// The consumer template's caller files are the reference for this repository's
// consumer-template workflow. Each call must match in `uses`, `with` (minus the
// two keys the workflow adds), `secrets`, `permissions`, and trigger: the
// template file's `on:` event set maps to the workflow job's `if:`. Non-call
// jobs and the workflow's own `on:`/`paths` are outside the comparison; the
// mutation refusal job is the one allowed extra.
import { basename, join } from '@std/path'
import { parse } from '@std/yaml'
import { holds, Undecided, type Verdict, violated } from './verdict.ts'

type Job = Readonly<Record<string, unknown>>

/** `with:` keys the workflow adds, which the template's callers do not carry. */
export const EXEMPT_WITH = ['working-directory', 'record'] as const

/** The workflow `if:` a template file's `on:` event set maps to; undefined when no set matches. */
export const expectedIf = (events: readonly string[]): string | null | undefined => {
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
export const compareCall = (
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

const parseYamlFile = async (path: string, name: string): Promise<Record<string, unknown>> => {
  let text: string
  try {
    text = await Deno.readTextFile(path)
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) throw new Undecided(`${name}: missing`)
    throw cause
  }
  let doc: unknown
  try {
    doc = parse(text)
  } catch (cause) {
    throw new Undecided(`${name}: unparseable YAML - ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) throw new Undecided(`${name}: not a mapping`)
  return doc as Record<string, unknown>
}

const readStems = async (dir: string): Promise<readonly string[]> => {
  const stems: string[] = []
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isFile && entry.name.endsWith('.yml')) stems.push(entry.name.slice(0, -'.yml'.length))
    }
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) throw new Undecided('templates/consumer/.github/workflows: missing')
    throw cause
  }
  return stems.sort()
}

const eventsOf = (file: Record<string, unknown>, name: string): readonly string[] => {
  const on = file['on']
  if (typeof on === 'string') return [on]
  if (typeof on === 'object' && on !== null && !Array.isArray(on)) return Object.keys(on)
  throw new Undecided(`${name}: \`on:\` is not an event set`)
}

export const checkTemplateCallers = async (root: string): Promise<Verdict> => {
  const templateDir = join(root, 'templates', 'consumer', '.github', 'workflows')
  const workflowName = '.github/workflows/consumer-template.yml'
  const stems = await readStems(templateDir)
  const workflow = await parseYamlFile(join(root, workflowName), workflowName)
  const jobs = mapping(workflow['jobs'], `${workflowName} \`jobs:\``)
  const violations: string[] = []
  const reusables: string[] = []
  for (const stem of stems) {
    const name = `templates/consumer/.github/workflows/${stem}.yml`
    const file = await parseYamlFile(join(templateDir, `${stem}.yml`), name)
    const declared = mapping(file['jobs'], `${name} \`jobs:\``)
    const ids = Object.keys(declared)
    if (ids.length !== 1) throw new Undecided(`${name}: expected exactly one job, found ${ids.length}`)
    const templateJob = declared[ids[0]!] as Job
    const uses = templateJob['uses']
    const reusable = typeof uses === 'string' && uses.length > 0 ? basename(uses) : `${stem}.yml`
    reusables.push(reusable)
    violations.push(...compareCall(reusable, templateJob, jobs[stem] as Job | undefined, eventsOf(file, name)))
  }
  if (violations.length === 0) return holds(`${reusables.length} template caller(s) match the workflow's calls`)
  return violated(
    violations,
    'The consumer-template workflow must call each reusable exactly as the template does, apart from the `working-directory` and `record` inputs it adds. Next: make the two call sites equal (R14).',
  )
}
