// The consumer template's caller files are the reference for this repository's
// workflows that run the template: every workflow under .github/workflows with a
// job that calls a reusable on `templates/consumer`. Each caller is mirrored by
// the one call job of its id in those workflows, and must match it in `uses`,
// `with` (the workflow adds two keys the template's callers never carry),
// `secrets`, `permissions`, and trigger: the caller's `on:` event set equals the
// mirroring workflow's, or is one of its events and the job's `if:` selects it.
// In reverse, every call job in those workflows needs a template caller of the
// same id. Jobs without `uses:` and the workflows' `paths` and schedules are
// outside the comparison.
import { basename, join, normalize } from '@std/path'
import { canonical, holds, parseYamlObject, Undecided, type Verdict, violated } from './verdict.ts'

type Job = Readonly<Record<string, unknown>>

/** `with:` keys the workflow adds, which the template's callers do not carry. */
const EXEMPT_WITH = ['working-directory', 'record'] as const

type ExpectedIf =
  | { readonly _tag: 'NoIf' }
  | { readonly _tag: 'Exact'; readonly value: string }
  | { readonly _tag: 'Unsupported' }

/** The `if:` a mirror job needs so it runs on exactly the caller's events inside its workflow's. */
const expectedIf = (events: readonly string[], workflowEvents: readonly string[]): ExpectedIf => {
  const same = events.length === workflowEvents.length && events.every((event) => workflowEvents.includes(event))
  if (same) return { _tag: 'NoIf' }
  if (events.length === 1 && workflowEvents.includes(events[0]!)) {
    return { _tag: 'Exact', value: `github.event_name == '${events[0]}'` }
  }
  return { _tag: 'Unsupported' }
}

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

/** A call job in a workflow that runs the template, with that workflow's event set. */
type Mirror = { readonly workflow: string; readonly events: readonly string[]; readonly job: Job }

/** Every difference between a template caller and its one mirror job, each prefixed with the reusable. */
const compareCall = (
  reusable: string,
  id: string,
  templateJob: Job,
  mirrors: readonly Mirror[],
  events: readonly string[],
): readonly string[] => {
  if (mirrors.length === 0) return [`${reusable}: no workflow that runs the template has a \`${id}\` call job`]
  if (mirrors.length > 1) {
    const where = mirrors.map((mirror) => mirror.workflow).join(', ')
    return [`${reusable}: ${mirrors.length} workflows call it as \`${id}\` (${where}); exactly one may`]
  }
  const { workflow, events: workflowEvents, job: workflowJob } = mirrors[0]!
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
  const expected = expectedIf(events, workflowEvents)
  const actual = workflowJob['if'] === undefined ? null : String(workflowJob['if'])
  const wanted = expected._tag === 'Exact' ? expected.value : null
  if (expected._tag === 'Unsupported') {
    lines.push(
      `on: ${JSON.stringify([...events].sort())} has no supported workflow trigger in ${workflow}, whose on: is ${
        JSON.stringify([...workflowEvents].sort())
      }`,
    )
  } else if (wanted !== actual) {
    lines.push(`if: template maps to ${show(wanted)} but the workflow sets ${show(actual)}`)
  }
  return lines.map((line) => `${reusable}: ${line}`)
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
  return parseYamlObject(text, name)
}

/** One caller file under the template's workflows directory. */
export interface CallerFile {
  /** The file name without its extension: the caller's job id in the workflow. */
  readonly stem: string
  /** The repo-relative path. */
  readonly name: string
}

const CALLER_EXTENSION = /\.ya?ml$/

/** The repo-relative path of every `.yml`/`.yaml` file in `relative`, sorted; a missing directory is undecided. */
const workflowFiles = async (root: string, relative: string): Promise<readonly string[]> => {
  const names: string[] = []
  try {
    for await (const entry of Deno.readDir(join(root, relative))) {
      if (entry.isFile && CALLER_EXTENSION.test(entry.name)) names.push(join(relative, entry.name))
    }
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) throw new Undecided(`${relative}: missing`)
    throw cause
  }
  return names.sort()
}

/** Every caller file in templates/consumer/.github/workflows, sorted; a missing directory is undecided. */
export const templateCallerFiles = async (root: string): Promise<readonly CallerFile[]> =>
  (await workflowFiles(root, join('templates', 'consumer', '.github', 'workflows'))).map((name) => ({
    stem: basename(name).replace(CALLER_EXTENSION, ''),
    name,
  }))

const eventsOf = (file: Record<string, unknown>, name: string): readonly string[] => {
  const on = file['on']
  if (typeof on === 'string') return [on]
  if (typeof on === 'object' && on !== null && !Array.isArray(on)) return Object.keys(on)
  throw new Undecided(`${name}: \`on:\` is not an event set`)
}

const TEMPLATE_DIR = join('templates', 'consumer')

/** Whether a call's `working-directory` names the template's directory, however the path is spelled. */
const isTemplateDir = (value: unknown): boolean =>
  typeof value === 'string' && normalize(value).replace(/\/+$/, '') === TEMPLATE_DIR

/**
 * Every call job, by id, in each workflow under .github/workflows that runs the
 * template, a workflow with a call job whose `working-directory` is the template's.
 * Undecided when no workflow runs it.
 */
const mirrorJobs = async (root: string): Promise<ReadonlyMap<string, readonly Mirror[]>> => {
  const relative = join('.github', 'workflows')
  const byId = new Map<string, Mirror[]>()
  for (const workflow of await workflowFiles(root, relative)) {
    const doc = await parseYamlFile(join(root, workflow), workflow)
    const calls = Object.entries(mapping(doc['jobs'], `${workflow} \`jobs:\``))
      .map(([id, value]) => [id, mapping(value, `${workflow} job \`${id}\``)] as const)
      .filter(([, job]) => job['uses'] !== undefined)
    const runsTemplate = calls.some(([id, job]) =>
      isTemplateDir(mapping(job['with'], `${workflow} job \`${id}\` \`with:\``)['working-directory'])
    )
    if (!runsTemplate) continue
    const events = eventsOf(doc, workflow)
    for (const [id, job] of calls) byId.set(id, [...(byId.get(id) ?? []), { workflow, events, job }])
  }
  if (byId.size === 0) throw new Undecided(`no workflow under ${relative} calls a reusable on ${TEMPLATE_DIR}`)
  return byId
}

export const checkTemplateCallers = async (root: string): Promise<Verdict> => {
  const files = await templateCallerFiles(root)
  const mirrors = await mirrorJobs(root)
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
    violations.push(...compareCall(reusable, stem, templateJob, mirrors.get(stem) ?? [], eventsOf(file, name)))
  }
  for (const [id, jobs] of mirrors) {
    if (callerIds.has(id)) continue
    for (const { workflow, job } of jobs) {
      violations.push(`${String(job['uses'])}: ${workflow}'s \`${id}\` job calls it, but no template caller does`)
    }
  }
  if (violations.length === 0) return holds(`${reusables.length} template caller(s) match the workflows' calls`)
  return violated(
    violations,
    "The workflows that run the template must call each reusable exactly as the template does, in one job of the caller's id under the caller's triggers, apart from the `working-directory` and `record` inputs they add, and make no workflow call in a job no template caller names. Next: make the two call sites equal (R14).",
  )
}
