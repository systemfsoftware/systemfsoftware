// The consumer template's caller files are the reference for this repository's
// consumer-template workflow. Each call must match in `uses`, `with` (the
// workflow adds two keys the template's callers never carry), `secrets`,
// `permissions`, and trigger: the template file's `on:` event set maps to the
// workflow job's `if:`. In reverse, every workflow job with a job-level `uses:`
// needs a template caller file of the same job id. Jobs without `uses:` and the
// workflow's own `on:`/`paths` are outside the comparison.
import { basename, join } from '@std/path'
import { parse } from '@std/yaml'
import { holds, Undecided, type Verdict, violated } from './verdict.ts'

type Job = Readonly<Record<string, unknown>>

/** `with:` keys the workflow adds, which the template's callers do not carry. */
const EXEMPT_WITH = ['working-directory', 'record'] as const

type ExpectedIf =
  | { readonly _tag: 'NoIf' }
  | { readonly _tag: 'Exact'; readonly value: string }
  | { readonly _tag: 'Unsupported' }

const expectedIf = (events: readonly string[]): ExpectedIf => {
  if (events.length === 2 && events.includes('pull_request') && events.includes('push')) return { _tag: 'NoIf' }
  if (events.length === 1 && events[0] === 'pull_request') {
    return { _tag: 'Exact', value: "github.event_name == 'pull_request'" }
  }
  if (events.length === 1 && events[0] === 'push') return { _tag: 'Exact', value: "github.event_name == 'push'" }
  return { _tag: 'Unsupported' }
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

const withoutExempt = (value: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([key]) => !(EXEMPT_WITH as readonly string[]).includes(key)))

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
  const templateWith = mapping(templateJob['with'], 'template caller `with:`')
  for (const key of EXEMPT_WITH) {
    if (key in templateWith) lines.push(`with.${key}: the template caller carries it, but only the workflow adds it`)
  }
  const workflowWith = mapping(workflowJob['with'], 'workflow call `with:`')
  lines.push(...mappingDiffs('with', withoutExempt(templateWith), withoutExempt(workflowWith)))
  lines.push(...mappingDiffs('secrets', templateJob['secrets'], workflowJob['secrets']))
  lines.push(...mappingDiffs('permissions', templateJob['permissions'], workflowJob['permissions']))
  const expected = expectedIf(events)
  const actual = workflowJob['if'] === undefined ? null : String(workflowJob['if'])
  const wanted = expected._tag === 'Exact' ? expected.value : null
  if (expected._tag === 'Unsupported') {
    lines.push(`on: ${JSON.stringify([...events].sort())} has no supported workflow trigger`)
  } else if (wanted !== actual) {
    lines.push(`if: template maps to ${show(wanted)} but the workflow sets ${show(actual)}`)
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

export const callerJob = (doc: Record<string, unknown>, name: string): { readonly id: string; readonly job: Job } => {
  const declared = mapping(doc['jobs'], `${name} \`jobs:\``)
  const ids = Object.keys(declared)
  if (ids.length !== 1) throw new Undecided(`${name}: expected exactly one job, found ${ids.length}`)
  const id = ids[0]!
  return { id, job: mapping(declared[id], `${name} job \`${id}\``) }
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
  const callerIds = new Set<string>()
  for (const { stem, name } of files) {
    const file = await parseYamlFile(join(root, name), name)
    const { id, job: templateJob } = callerJob(file, name)
    if (id !== stem) violations.push(`${name}: its job id is \`${id}\`, but the workflow calls it as \`${stem}\``)
    const uses = templateJob['uses']
    const reusable = typeof uses === 'string' && uses.length > 0 ? basename(uses) : `${stem}.yml`
    reusables.push(reusable)
    callerIds.add(stem)
    violations.push(...compareCall(reusable, templateJob, jobs[stem] as Job | undefined, eventsOf(file, name)))
  }
  for (const [id, job] of Object.entries(jobs)) {
    const uses = mapping(job, `${workflowName} job \`${id}\``)['uses']
    if (uses !== undefined && !callerIds.has(id)) {
      violations.push(`${String(uses)}: the workflow's \`${id}\` job calls it, but no template caller does`)
    }
  }
  if (violations.length === 0) return holds(`${reusables.length} template caller(s) match the workflow's calls`)
  return violated(
    violations,
    'The consumer-template workflow must call each reusable exactly as the template does, apart from the `working-directory` and `record` inputs it adds, and make no workflow call in a job no template caller names. Next: make the two call sites equal (R14).',
  )
}
