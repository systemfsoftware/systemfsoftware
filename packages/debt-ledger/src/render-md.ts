import { Array as Arr, Match } from 'effect'
import { KIND_ORDER } from './assemble.js'
import type { Entry, EntryKind, LedgerEntry, Status } from './Entry.schema.js'
import type { Ledger } from './Ledger.schema.js'

const patchNameOf = (dependency: string): string =>
  Match.value(dependency.lastIndexOf('@')).pipe(
    Match.when((at) => at <= 0, () => dependency),
    Match.orElse((at) => dependency.slice(0, at)),
  )

const patchVersionOf = (dependency: string): string =>
  Match.value(dependency.lastIndexOf('@')).pipe(
    Match.when((at) => at <= 0, () => ''),
    Match.orElse((at) => dependency.slice(at + 1)),
  )

const kindOf = (entry: Entry): string =>
  Match.value(entry).pipe(
    Match.tag('InlineDirective', () => 'InlineDirective'),
    Match.tag('RustAttribute', () => 'RustAttribute'),
    Match.tag('SkippedTest', () => 'SkippedTest'),
    Match.tag('Marker', () => 'Marker'),
    Match.tag('ConfigSeverity', () => 'ConfigSeverity'),
    Match.tag('Grant', () => 'Grant'),
    Match.tag('Patch', () => 'Patch'),
    Match.exhaustive,
  )

const detailOf = (entry: Entry): string =>
  Match.value(entry).pipe(
    Match.tag('InlineDirective', (item) => `${item.family}: ${item.text}`),
    Match.tag('RustAttribute', (item) => `#[${item.attribute}(${item.path})]`),
    Match.tag('SkippedTest', (item) => `${item.kind} ${item.name}`),
    Match.tag('Marker', (item) => `${item.tag}: ${item.text}`),
    Match.tag('ConfigSeverity', (item) => `${item.scope}=${item.value}`),
    Match.tag('Grant', (item) => `${item.name} (${item.variant}) ${item.owner}`),
    Match.tag('Patch', (item) => `${patchNameOf(item.dependency)} ${patchVersionOf(item.dependency)} ${item.patch}`),
    Match.exhaustive,
  )

const locationOf = (entry: Entry): string =>
  Match.value(entry).pipe(
    Match.tag('InlineDirective', (item) => `${item.file}:${item.line}`),
    Match.tag('RustAttribute', (item) => `${item.file}:${item.line}`),
    Match.tag('SkippedTest', (item) => `${item.file}:${item.line}`),
    Match.tag('Marker', (item) => `${item.file}:${item.line}`),
    Match.tag('ConfigSeverity', (item) => item.file),
    Match.tag('Grant', (item) => item.package),
    Match.tag('Patch', (item) => item.file),
    Match.exhaustive,
  )

const statusOf = (status: Status): string =>
  Match.value(status).pipe(
    Match.tag('Declared', (item) =>
      item.recheck === undefined
        ? `Declared ${item.owner} — ${item.name}: ${item.reason}`
        : `Declared ${item.owner} — ${item.name}: ${item.reason} (recheck: ${item.recheck})`),
    Match.tag('Undeclared', (item) => `Undeclared: ${item.why}`),
    Match.tag('Stale', (item) => `Stale: ${item.why}`),
    Match.exhaustive,
  )

const cell = (value: string): string => value.replaceAll('|', '\\|').replaceAll('\n', ' ')

const rowOf = (ledgerEntry: LedgerEntry): string =>
  `| \`${cell(locationOf(ledgerEntry.entry))}\` | ${cell(detailOf(ledgerEntry.entry))} | ${
    cell(statusOf(ledgerEntry.status))
  } |`

const sectionOf = (ledger: Ledger, kind: EntryKind): string => {
  const rows = Arr.filter(ledger.entries, (entry) => kindOf(entry.entry) === kind)
  return [
    `## ${kind}`,
    '',
    '| Location | Detail | Status |',
    '| --- | --- | --- |',
    ...Arr.map(rows, rowOf),
  ].join('\n')
}

const totalsRow = (ledger: Ledger, kind: string): string => `| ${kind} | ${ledger.totals[kind] ?? 0} |`
const statusRow = (ledger: Ledger, status: string): string => `| ${status} | ${ledger.statusTotals[status] ?? 0} |`

export const renderMarkdown = (ledger: Ledger): string => {
  const header = [
    '# Debt ledger',
    '',
    `Scanned ${ledger.fileCount} files across channels: ${ledger.scannedChannels.join(', ')}.`,
    '',
    '## Totals',
    '',
    '| Kind | Count |',
    '| --- | --- |',
    ...KIND_ORDER.map((kind) => totalsRow(ledger, kind)),
    '',
    '| Status | Count |',
    '| --- | --- |',
    ...['Declared', 'Undeclared', 'Stale'].map((status) => statusRow(ledger, status)),
    '',
  ].join('\n')
  const sections = KIND_ORDER.map((kind) => `\n${sectionOf(ledger, kind)}\n`)
  return `${header}${sections.join('')}`
}
