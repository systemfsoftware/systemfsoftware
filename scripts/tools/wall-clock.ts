import { parseArgs } from '@std/cli/parse-args'
import { join } from '@std/path'

export const JOB_BUDGET_SECONDS = 600
export const JOB_BUDGET_SECONDS_DOCS_ONLY = 180
export const CALL_BUDGET_SECONDS = 600

export type WarningCode =
  | 'wall-clock-over-budget'
  | 'wall-clock-record-malformed'
  | 'wall-clock-record-other-attempt'
  | 'wall-clock-record-end-before-start'
  | 'wall-clock-record-missing'

export interface Warning {
  readonly code: WarningCode
  readonly text: string
}

export interface RecordFile {
  readonly artifact: string
  readonly text: string
}

export interface JobRecord {
  readonly call: string
  readonly group: string
  readonly job: string
  readonly name: string
  readonly attempt: number
  readonly start: number
  readonly end: number
  readonly outcome: string
  readonly reason: string | null
}

export interface Needs {
  readonly [job: string]: { readonly result?: string }
}

export interface Ctx {
  readonly event: string
  readonly scope: string
  readonly attempt: number
  readonly needs?: Needs
}

export interface Row {
  readonly job: string
  readonly name: string
  readonly outcome: string
  readonly wall: string
  readonly reason: string
  readonly budget: string
}

export interface Decision {
  readonly rows: readonly Row[]
  readonly warnings: readonly Warning[]
}

type Parsed = { readonly record: JobRecord } | { readonly error: string }

export const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export const escapeAnnotation = (text: string): string =>
  text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')

export const formatWarning = ({ code, text }: Warning): string => `::warning title=${code}::${escapeAnnotation(text)}`

export const parseRecord = (text: string): Parsed => {
  if (text.trim() === '') return { error: 'the record is empty' }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { error: 'the record is not JSON' }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { error: 'the record is not a JSON object' }
  }
  const fields = value as Record<string, unknown>
  if (fields.version !== 1) return { error: `version ${JSON.stringify(fields.version)} is not 1` }
  for (const key of ['call', 'group', 'job', 'name', 'outcome'] as const) {
    if (typeof fields[key] !== 'string') return { error: `${key} is not a string` }
  }
  for (const key of ['attempt', 'start', 'end'] as const) {
    if (typeof fields[key] !== 'number' || !Number.isFinite(fields[key])) return { error: `${key} is not a number` }
  }
  if (fields.reason !== null && typeof fields.reason !== 'string') {
    return { error: 'reason is neither a string nor null' }
  }
  return {
    record: {
      call: fields.call as string,
      group: fields.group as string,
      job: fields.job as string,
      name: fields.name as string,
      attempt: fields.attempt as number,
      start: fields.start as number,
      end: fields.end as number,
      outcome: fields.outcome as string,
      reason: fields.reason as string | null,
    },
  }
}

const jobBudget = (ctx: Ctx): number | undefined => {
  if (ctx.event !== 'pull_request') return undefined
  return ctx.scope === 'docs-only' ? JOB_BUDGET_SECONDS_DOCS_ONLY : JOB_BUDGET_SECONDS
}

const tableCell = (text: string): string => text.replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ')

export const renderSummary = (decision: Decision, ctx: Ctx): string => {
  const budget = jobBudget(ctx)
  return [
    budget === undefined
      ? '### Wall clock'
      : `### Wall clock (budget ${formatDuration(budget)} per job, ${formatDuration(CALL_BUDGET_SECONDS)} per call)`,
    '',
    '| Job | Name | Outcome | Wall | Reason | Budget |',
    '|---|---|---|---|---|---|',
    ...decision.rows.map((row) =>
      `| ${tableCell(row.job)} | ${tableCell(row.name)} | ${tableCell(row.outcome)} | ${row.wall} | ` +
      `${tableCell(row.reason)} | ${row.budget} |`
    ),
    '',
  ].join('\n')
}

export const decide = (records: readonly RecordFile[], ctx: Ctx): Decision => {
  const rows: Row[] = []
  const warnings: Warning[] = []
  const budget = jobBudget(ctx)
  const current: { readonly call: string; readonly group: string; readonly start: number; readonly end: number }[] = []
  let everyJobWithinBudget = true
  for (const file of records) {
    const parsed = parseRecord(file.text)
    if ('error' in parsed) {
      warnings.push({ code: 'wall-clock-record-malformed', text: `artifact ${file.artifact}: ${parsed.error}` })
      continue
    }
    const record = parsed.record
    if (record.attempt !== ctx.attempt) {
      warnings.push({
        code: 'wall-clock-record-other-attempt',
        text: `artifact ${file.artifact}: attempt ${record.attempt}, not the current attempt ${ctx.attempt}`,
      })
      continue
    }
    const seconds = record.end - record.start
    if (seconds < 0) {
      warnings.push({
        code: 'wall-clock-record-end-before-start',
        text: `artifact ${file.artifact}: end ${record.end} is before start ${record.start}`,
      })
      continue
    }
    const overBudget = budget !== undefined && seconds > budget
    if (overBudget) {
      everyJobWithinBudget = false
      warnings.push({
        code: 'wall-clock-over-budget',
        text: `job ${record.job} (${record.name}) wall ${formatDuration(seconds)}, budget ${formatDuration(budget)}`,
      })
    }
    rows.push({
      job: record.job,
      name: record.name,
      outcome: record.outcome,
      wall: formatDuration(seconds),
      reason: record.reason ?? '',
      budget: budget === undefined ? '' : `${budget}s${overBudget ? ' (over)' : ''}`,
    })
    current.push({ call: record.call, group: record.group, start: record.start, end: record.end })
  }
  if (budget !== undefined && current.length > 0 && everyJobWithinBudget) {
    const span = Math.max(...current.map((record) => record.end)) -
      Math.min(...current.map((record) => record.start))
    if (span > CALL_BUDGET_SECONDS) {
      warnings.push({
        code: 'wall-clock-over-budget',
        text: `call ${current[0].call} wall ${formatDuration(span)}, budget ${formatDuration(CALL_BUDGET_SECONDS)}`,
      })
    }
  }
  if (ctx.needs !== undefined) {
    const measuredGroups = new Set(current.map((record) => record.group))
    for (const [job, entry] of Object.entries(ctx.needs)) {
      const result = (entry as { readonly result?: string } | null | undefined)?.result
      if (result !== 'success' && result !== 'failure' && result !== 'cancelled') continue
      if (measuredGroups.has(job)) continue
      warnings.push({
        code: 'wall-clock-record-missing',
        text: `no record of ${job} in attempt ${ctx.attempt}, but its needs result is ${result}`,
      })
    }
  }
  return { rows, warnings }
}

const readRecords = async (dir: string): Promise<readonly RecordFile[]> => {
  const names: string[] = []
  try {
    for await (const entry of Deno.readDir(dir)) if (entry.isDirectory) names.push(entry.name)
  } catch {
    return []
  }
  names.sort()
  const files: RecordFile[] = []
  for (const artifact of names) {
    const text = await Deno.readTextFile(join(dir, artifact, 'record.json')).catch(() => '')
    files.push({ artifact, text })
  }
  return files
}

const readNeeds = async (file: string | undefined): Promise<Needs | undefined> => {
  if (file === undefined || file === '') return undefined
  try {
    const value: unknown = JSON.parse(await Deno.readTextFile(file))
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Needs) : undefined
  } catch {
    return undefined
  }
}

if (import.meta.main) {
  const args = parseArgs(Deno.args, { string: ['records', 'attempt', 'event', 'scope', 'needs'] })
  const attempt = Number.parseInt(args.attempt ?? '', 10)
  const needs = await readNeeds(args.needs)
  const ctx: Ctx = {
    event: args.event ?? '',
    scope: args.scope ?? '',
    attempt: Number.isInteger(attempt) ? attempt : 0,
    ...(needs === undefined ? {} : { needs }),
  }
  const decision = decide(args.records === undefined ? [] : await readRecords(args.records), ctx)
  const summary = renderSummary(decision, ctx)
  const stepSummary = Deno.env.get('GITHUB_STEP_SUMMARY')
  if (stepSummary === undefined || stepSummary === '') console.log(summary)
  else await Deno.writeTextFile(stepSummary, summary, { append: true })
  for (const warning of decision.warnings) console.log(formatWarning(warning))
}
