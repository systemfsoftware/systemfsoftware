// PreToolUse config guard: vetoes edits to an oxlint config that disable a rule
// that was not already disabled. Pure decisions first (extractPairs, decide),
// then a thin shell (read stdin, read the on-disk old side, print the verdict).
// Runs on Deno with --allow-read only: it reads files, never runs them.

import { parse as parseJsonc } from '@std/jsonc'
import * as path from '@std/path'
import { decodePayload, OXLINT_CONFIG_BASENAMES, readStdin } from './payload.ts'
import type { EditCommand } from './payload.ts'

/** A before/after text pair applied to a buffer. */
interface Hunk {
  readonly oldString: string
  readonly newString: string
}

export interface ContentPair {
  readonly oldSide: string | undefined
  readonly newSide: string
}

export type Extraction =
  | { readonly tag: 'pairs'; readonly pairs: ContentPair[] }
  | { readonly tag: 'contentless' }
  | { readonly tag: 'unrecoverable'; readonly reason: string }

export type Verdict =
  | { readonly tag: 'allow' }
  | { readonly tag: 'block'; readonly rules: string[] }
  | { readonly tag: 'cannot-verify'; readonly reason: string }

// ---------------------------------------------------------------------------
// Extraction: turn a tool payload into whole-document before/after pairs.
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isArray = (value: unknown): value is readonly unknown[] => Array.isArray(value)

const toPairs = (pairs: ContentPair[]): Extraction =>
  pairs.length > 0 ? { tag: 'pairs', pairs } : { tag: 'contentless' }

// Replace the FIRST occurrence of oldString in buffer; undefined when absent. An
// old_string absent from the buffer means the reconstructed document has
// diverged from what the tool will land, so callers fail closed.
const replaceFirst = (buffer: string, oldString: string, newString: string): string | undefined => {
  const index = buffer.indexOf(oldString)
  return index === -1 ? undefined : buffer.slice(0, index) + newString + buffer.slice(index + oldString.length)
}

// Apply every hunk to the buffer sequentially — hunk N sees the buffer after
// hunks 0..N-1, exactly as MultiEdit applies its edits — replacing the first
// occurrence of each old_string.
type ApplyResult = { readonly tag: 'ok'; readonly content: string } | {
  readonly tag: 'unrecoverable'
  readonly reason: string
}

const applyHunks = (buffer: string, hunks: readonly Hunk[]): ApplyResult => {
  let current = buffer
  for (const hunk of hunks) {
    const next = replaceFirst(current, hunk.oldString, hunk.newString)
    if (next === undefined) {
      return {
        tag: 'unrecoverable',
        reason: `hunk old_string ${JSON.stringify(hunk.oldString)} is not present in the on-disk config content`,
      }
    }
    current = next
  }
  return { tag: 'ok', content: current }
}

// ONE whole-document pair per edit call: the on-disk content as the old side and
// the on-disk content with every hunk applied as the new side. A raw hunk is
// never a valid JSON document, so whole documents are what the JSON path parses.
// With no on-disk content there is no buffer to apply hunks to, and the result
// cannot be reconstructed, so the extraction fails closed rather than guess.
const reconstructedPair = (diskContent: string | undefined, hunks: readonly Hunk[]): Extraction => {
  if (diskContent === undefined) {
    return {
      tag: 'unrecoverable',
      reason: 'there is no on-disk config content to apply the edit to, so the edited result cannot be reconstructed',
    }
  }
  const applied = applyHunks(diskContent, hunks)
  return applied.tag === 'ok'
    ? { tag: 'pairs', pairs: [{ oldSide: diskContent, newSide: applied.content }] }
    : applied
}

const hunkFromRecord = (
  record: Record<string, unknown>,
): Hunk | undefined | { tag: 'unrecoverable'; reason: string } => {
  const oldString = record['old_string']
  const newString = record['new_string']
  if (oldString === undefined && newString === undefined) {
    return undefined
  }
  if (typeof oldString === 'string' && typeof newString === 'string') {
    return { oldString, newString }
  }
  return { tag: 'unrecoverable', reason: 'an edit entry is not a valid before/after pair' }
}

const extractEditShape = (input: Record<string, unknown>, diskContent: string | undefined): Extraction => {
  const hunk = hunkFromRecord(input)
  if (hunk === undefined) {
    return { tag: 'contentless' }
  }
  if ('tag' in hunk) {
    return hunk
  }
  return reconstructedPair(diskContent, [hunk])
}

const extractWriteShape = (input: Record<string, unknown>, diskContent: string | undefined): Extraction => {
  const content = input['content']
  if (content === undefined) {
    return { tag: 'contentless' }
  }
  if (typeof content !== 'string') {
    return { tag: 'unrecoverable', reason: 'Write/Create payload carries non-string content' }
  }
  return toPairs([{ oldSide: diskContent, newSide: content }])
}

const entryRecord = (entry: unknown): Record<string, unknown> | undefined => isRecord(entry) ? entry : undefined

const entryHunk = (entry: unknown): Hunk | undefined | { tag: 'unrecoverable'; reason: string } => {
  const record = entryRecord(entry)
  if (record === undefined) {
    return { tag: 'unrecoverable', reason: 'a MultiEdit/Update entry is not a valid before/after pair' }
  }
  return hunkFromRecord(record)
}

type HunkCollection = { readonly tag: 'ok'; readonly hunks: Hunk[] } | {
  readonly tag: 'unrecoverable'
  readonly reason: string
}

const hunksFromEntries = (entries: readonly unknown[]): HunkCollection => {
  const hunks: Hunk[] = []
  for (const entry of entries) {
    const hunk = entryHunk(entry)
    if (hunk === undefined) {
      continue
    }
    if ('tag' in hunk) {
      return hunk
    }
    hunks.push(hunk)
  }
  return { tag: 'ok', hunks }
}

const pairFromHunks = (diskContent: string | undefined, hunks: readonly Hunk[]): Extraction =>
  hunks.length > 0 ? reconstructedPair(diskContent, hunks) : { tag: 'contentless' }

const extractMultiShape = (input: Record<string, unknown>, diskContent: string | undefined): Extraction => {
  const edits = input['edits']
  if (edits === undefined) {
    return extractEditShape(input, diskContent)
  }
  if (!isArray(edits)) {
    return { tag: 'unrecoverable', reason: 'MultiEdit/Update payload carries non-array edits' }
  }
  const collected = hunksFromEntries(edits)
  return collected.tag === 'ok' ? pairFromHunks(diskContent, collected.hunks) : collected
}

const findReplaceHunk = (entry: unknown): Hunk | undefined | { tag: 'unrecoverable'; reason: string } => {
  const record = entryRecord(entry)
  if (record === undefined) {
    return { tag: 'unrecoverable', reason: 'a morph file_edits entry is not a valid find/replace pair' }
  }
  const find = record['find']
  const replace = record['replace']
  if (find === undefined && replace === undefined) {
    return undefined
  }
  if (typeof find === 'string' && typeof replace === 'string') {
    return { oldString: find, newString: replace }
  }
  return { tag: 'unrecoverable', reason: 'a morph file_edits entry is not a valid find/replace pair' }
}

const extractMorphShape = (input: Record<string, unknown>, diskContent: string | undefined): Extraction => {
  const contentKeys = Object.keys(input).filter((key) => key !== 'file_path')
  if (contentKeys.length === 0) {
    return { tag: 'contentless' }
  }
  const edits = input['edits']
  const fileEdits = input['file_edits']
  if (isArray(edits)) {
    const collected = hunksFromEntries(edits)
    return collected.tag === 'ok' ? pairFromHunks(diskContent, collected.hunks) : collected
  }
  if (isArray(fileEdits)) {
    const hunks: Hunk[] = []
    for (const entry of fileEdits) {
      const hunk = findReplaceHunk(entry)
      if (hunk === undefined) {
        continue
      }
      if ('tag' in hunk) {
        return hunk
      }
      hunks.push(hunk)
    }
    return pairFromHunks(diskContent, hunks)
  }
  return {
    tag: 'unrecoverable',
    reason: `raw morph content (${contentKeys.join(', ')}) cannot be turned into a before/after pair`,
  }
}

const toolShapeOf = (name: string): 'edit' | 'write' | 'create' | 'multi' | 'morph' => {
  switch (name) {
    case 'Edit':
      return 'edit'
    case 'Write':
      return 'write'
    case 'Create':
      return 'create'
    case 'Update':
    case 'MultiEdit':
      return 'multi'
    default:
      return 'morph'
  }
}

export const extractPairs = (command: EditCommand, diskContent: string | undefined): Extraction => {
  const shape = toolShapeOf(command.toolName)
  switch (shape) {
    case 'edit':
      return extractEditShape(command.toolInput, diskContent)
    case 'write':
    case 'create':
      return extractWriteShape(command.toolInput, diskContent)
    case 'multi':
      return extractMultiShape(command.toolInput, diskContent)
    case 'morph':
      return extractMorphShape(command.toolInput, diskContent)
  }
}

// ---------------------------------------------------------------------------
// Verdict: scan the before/after pairs for rules that were newly turned off.
// ---------------------------------------------------------------------------

const configBasename = (targetPath: string): string =>
  targetPath.slice(Math.max(targetPath.lastIndexOf('/'), targetPath.lastIndexOf('\\')) + 1)

const isConfigTarget = (targetPath: string): boolean =>
  (OXLINT_CONFIG_BASENAMES as readonly string[]).includes(configBasename(targetPath))

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type RulesEntries = Array<readonly [string, unknown]>

// Every map is read with Object.entries on the parsed value instead of being
// decoded into a record, because record decoders silently drop a key literally
// named "__proto__" — a config turning such a rule off would otherwise pass
// the guard.
const topLevelRules = (value: Record<string, unknown>): RulesEntries | { readonly reason: string } => {
  const rules = value['rules']
  if (rules === undefined) {
    return []
  }
  if (isJsonObject(rules)) {
    return Object.entries(rules)
  }
  return { reason: 'the config content is not a JSON object carrying a rules map' }
}

const overrideEntryRules = (entry: unknown): RulesEntries | undefined | { readonly reason: string } => {
  if (!isJsonObject(entry)) {
    return undefined
  }
  const rules = entry['rules']
  if (rules === undefined) {
    return undefined
  }
  if (isJsonObject(rules)) {
    return Object.entries(rules)
  }
  return { reason: 'an overrides entry carries a rules key that is not a JSON object' }
}

// oxlint honors `overrides: [{ files, rules }]`, so a rule turned off inside an
// override is as real a silencing as one in the top-level map. Collect the
// entries of the top-level rules map AND of every overrides[].rules map.
const overrideRules = (value: Record<string, unknown>): RulesEntries | { readonly reason: string } => {
  const overrides = value['overrides']
  if (overrides === undefined) {
    return []
  }
  if (!isArray(overrides)) {
    return { reason: 'the config content carries an overrides key that is not an array' }
  }
  const entries: RulesEntries = []
  for (const entry of overrides) {
    const nested = overrideEntryRules(entry)
    if (nested === undefined) {
      continue
    }
    if ('reason' in nested) {
      return nested
    }
    entries.push(...nested)
  }
  return entries
}

const rulesEntries = (value: unknown): RulesEntries | { readonly reason: string } => {
  if (!isJsonObject(value)) {
    return { reason: 'the config content is not a JSON object carrying a rules map' }
  }
  const top = topLevelRules(value)
  if ('reason' in top) {
    return top
  }
  const nested = overrideRules(value)
  if ('reason' in nested) {
    return nested
  }
  return [...top, ...nested]
}

const parseRules = (side: string): RulesEntries | { readonly reason: string } => {
  let parsed: unknown
  try {
    parsed = parseJsonc(side)
  } catch {
    return { reason: 'the config content is not valid JSON or JSONC' }
  }
  return rulesEntries(parsed)
}

// oxlint treats 'off', 'allow', and the numeric 0 — bare or as the first element
// of a severity array — as disabling a rule. Anything else ('deny'/'error'/
// 'warn'/1/2, bare or array-first) is an enabled severity the guard must not block.
const isOffSeverity = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return value === 'off' || value === 'allow'
  }
  if (value === 0) {
    return true
  }
  if (Array.isArray(value)) {
    return value.length > 0 && isOffSeverity(value[0])
  }
  return false
}

const scanJsonPair = (pair: ContentPair): readonly string[] | { readonly reason: string } => {
  const oldEntries = pair.oldSide === undefined ? [] : parseRules(pair.oldSide)
  if ('reason' in oldEntries) {
    return oldEntries
  }
  const newEntries = parseRules(pair.newSide)
  if ('reason' in newEntries) {
    return newEntries
  }
  const oldByName = new Map(oldEntries)
  return newEntries
    .filter(([name, severity]) => isOffSeverity(severity) && !isOffSeverity(oldByName.get(name)))
    .map(([name]) => name)
}

// Matches a rule-severity declaration: a quoted or bare rule key, colon, then a
// disabled severity — 'off', 'allow', or 0 — bare or as the first element of a
// severity array. Only scanned within brace-matched rules-map spans (see
// ruleSpansOf), never across the whole module source. Comments are stripped
// before matching. Deliberately does NOT catch: 'off' spelled through a
// variable, template literal, or imported/spread rule object, or any severity
// outside a literal `key: severity` position — the guard scans literal syntax only.
const RULE_OFF_PATTERN =
  /((?:"[^"'\n]+"|'[^"'\n]+'|[A-Za-z_$@][\w$@.-]*))\s*:\s*(?:\[\s*)?(?:"off"|'off'|"allow"|'allow'|0)(?![\d.])/g

const stripComments = (source: string): string =>
  source.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g,
    (match) => (match.startsWith('/') ? '' : match),
  )

// Neutralize braces inside string and template literals (keeping their length and
// contents otherwise intact) so a string can neither fake a `rules: {` opener nor
// distort the brace matching below. Quoted property keys like 'rules' stay
// readable because their contents are preserved.
const maskBracesInStrings = (source: string): string =>
  source.replace(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g,
    (match) => match.replace(/[{}]/g, 'x'),
  )

const BRACE_DELTAS: Readonly<Record<string, number>> = { '{': 1, '}': -1 }

const braceDelta = (char: string): number => BRACE_DELTAS[char] ?? 0

// Running brace balance after each character following the opening brace at
// openIndex; the first later index whose balance returns to 0 is the matching close.
const matchBraceClose = (masked: string, openIndex: number): number | undefined => {
  let balance = 1
  for (let index = openIndex + 1; index < masked.length; index += 1) {
    balance += braceDelta(masked[index] ?? '')
    if (balance === 0) {
      return index
    }
  }
  return undefined
}

// Every `rules:` map opener: the property name rules (bare or quoted), a colon,
// and the opening brace, preceded by a token boundary so `configuredRules: {`
// cannot open a span. Matched over the masked source, where braces inside
// strings are neutralized, so a `rules: {` inside a string cannot either.
const RULES_MAP_OPENER = /(?:^|[{,;\s])(?:["']?rules["']?)\s*:\s*\{/g

// Brace-matched spans of every rules map in the source — the top-level map and
// each overrides[].rules map alike. An opener whose braces never close yields no
// span: a span that cannot be located is scanned as nothing, never as the whole file.
const ruleSpansOf = (masked: string): ReadonlyArray<readonly [number, number]> => {
  const spans: Array<readonly [number, number]> = []
  for (const match of masked.matchAll(RULES_MAP_OPENER)) {
    const open = (match.index ?? 0) + match[0].length - 1
    const close = matchBraceClose(masked, open)
    if (close !== undefined) {
      spans.push([open, close])
    }
  }
  return spans
}

const offRulesIn = (source: string): readonly string[] => {
  const masked = maskBracesInStrings(source)
  return ruleSpansOf(masked).flatMap(([from, to]) =>
    Array.from(
      source.slice(from, to + 1).matchAll(RULE_OFF_PATTERN),
      (match) => (match[1] ?? '').replace(/^["']|["']$/g, ''),
    )
  )
}

const scanModulePair = (pair: ContentPair): readonly string[] => {
  const oldOff = offRulesIn(stripComments(pair.oldSide ?? ''))
  const newOff = offRulesIn(stripComments(pair.newSide))
  return newOff.filter((name) => !oldOff.includes(name))
}

const scanPair = (isJson: boolean, pair: ContentPair): readonly string[] | { readonly reason: string } =>
  isJson ? scanJsonPair(pair) : scanModulePair(pair)

const decidePairs = (isJson: boolean, pairs: readonly ContentPair[]): Verdict => {
  const rules: string[] = []
  for (const pair of pairs) {
    const scanned = scanPair(isJson, pair)
    if ('reason' in scanned) {
      return { tag: 'cannot-verify', reason: scanned.reason }
    }
    rules.push(...scanned)
  }
  return rules.length === 0 ? { tag: 'allow' } : { tag: 'block', rules: Array.from(new Set(rules)) }
}

const decideOnConfig = (extraction: Extraction, targetPath: string): Verdict => {
  switch (extraction.tag) {
    case 'contentless':
      return { tag: 'allow' }
    case 'unrecoverable':
      return { tag: 'cannot-verify', reason: extraction.reason }
    case 'pairs':
      return decidePairs(configBasename(targetPath).endsWith('.json'), extraction.pairs)
  }
}

export const decide = (extraction: Extraction, targetPath: string): Verdict =>
  isConfigTarget(targetPath) ? decideOnConfig(extraction, targetPath) : { tag: 'allow' }

// ---------------------------------------------------------------------------
// Messages.
// ---------------------------------------------------------------------------

export const blockMessage = (rules: readonly string[]): string =>
  `Blocked: this edit disables the oxlint rule(s) ${rules.join(', ')} in an oxlint config. ` +
  'Fix the underlying violation instead of disabling the rule.'

export const cannotVerifyMessage = (reason: string): string =>
  `Blocked: cannot verify this edit to an oxlint config file (${reason}). ` +
  'Re-express the change as Edit, Write, or MultiEdit so the before/after content can be checked.'

export const oversizeMessage =
  'Blocked: cannot verify this edit to an oxlint config file (the hook payload exceeded the 1 MiB input cap).'

// ---------------------------------------------------------------------------
// Shell.
// ---------------------------------------------------------------------------

export interface Fs {
  readonly exists: (target: string) => Promise<boolean>
  readonly readTextFile: (target: string) => Promise<string>
}

export const realFs: Fs = {
  exists: async (target) => {
    try {
      await Deno.stat(target)
      return true
    } catch {
      return false
    }
  },
  readTextFile: (target) => Deno.readTextFile(target),
}

// `file_path` arrives relative to the hook's process cwd. Resolve it against
// cwd exactly once (absolute inputs pass through untouched); joining it onto a
// base that already contains it was the old implementation's double-join bug.
const resolveAgainstCwd = (cwd: string, filePath: string): string =>
  path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath)

// The on-disk file is the pre-edit state for every edit tool: Write/Create use
// it as the old side, and the hunk tools (Edit/MultiEdit/Update/morph) rebuild
// the whole edited document from it. A file that is absent OR unreadable yields
// undefined — indistinguishable by design, so an unreadable target is treated
// exactly like a new file instead of as an empty string that would fail JSON
// parsing or look like every off-rule was newly added.
const readOldSide = async (fs: Fs, target: string): Promise<string | undefined> => {
  if (!await fs.exists(target)) {
    return undefined
  }
  try {
    return await fs.readTextFile(target)
  } catch {
    return undefined
  }
}

export interface GuardResult {
  readonly exitCode: number
  readonly stderr: string
}

export const runConfigGuard = async (raw: string, cwd: string, fs: Fs = realFs): Promise<GuardResult> => {
  const command = decodePayload(raw)
  if (command === undefined) {
    return { exitCode: 0, stderr: '' }
  }
  const target = resolveAgainstCwd(cwd, command.filePath)
  const diskContent = await readOldSide(fs, target)
  const extraction = extractPairs(command, diskContent)
  const verdict = decide(extraction, command.filePath)
  switch (verdict.tag) {
    case 'allow':
      return { exitCode: 0, stderr: '' }
    case 'block':
      return { exitCode: 2, stderr: blockMessage(verdict.rules) }
    case 'cannot-verify':
      return { exitCode: 2, stderr: cannotVerifyMessage(verdict.reason) }
  }
}

if (import.meta.main) {
  try {
    const stdin = await readStdin()
    if (stdin.tag === 'too-large') {
      console.error(oversizeMessage)
      Deno.exit(2)
    }
    const result = await runConfigGuard(stdin.content, Deno.cwd())
    if (result.stderr !== '') {
      console.error(result.stderr)
    }
    Deno.exit(result.exitCode)
  } catch (error) {
    // A defect falls to 1 so a crashing hook never blocks every edit; the
    // guard's fail-closed verdicts (unparseable shapes) return 2 as normal
    // decisions. Exit 1 is the non-blocking "the guard could not run" code.
    console.error(`oxlint-guard: internal error: ${error instanceof Error ? error.message : String(error)}`)
    Deno.exit(1)
  }
}
