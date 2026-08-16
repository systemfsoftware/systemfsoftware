/**
 * Output classification + parsing kernels for the microsandbox backend —
 * the pure half of "what did this msb invocation just say?". Behavioral
 * source: upstream rightsize-node `src/backend-msb/{backend.ts,
 * agent-endpoint.ts, ls-json.ts, follow-replay.ts, snapshot-import.ts,
 * snapshot-list.ts, snapshot-not-found.ts, snapshot-save-fsync.ts,
 * image-cache.ts, state-db.ts, port-conflict.ts}` (Apache-2.0). Every
 * wording matched below was captured verbatim against a real `msb` binary
 * (or, for the port-conflict and Windows save-failure shapes, against the
 * real hosted-runner transcripts upstream quotes); the matches are
 * deliberately substring/prefix based because msb has no structured/typed
 * error surface for any of these conditions.
 *
 * All functions are total and pure: text in, verdict out, never throws. The
 * adapter layer maps the tagged outcomes onto the typed error taxonomy and
 * owns every effect edge (spawn, poll, retry).
 */
import { basename } from 'node:path'

// ---------------------------------------------------------------------------
// Boot-failure classification (`msb run` early-exit combined output)
// ---------------------------------------------------------------------------

/** Whether `output` names msb's image-cache corruption: a cache index entry pointing at a layer file that is not on disk. */
export function isImageCacheCorruption(output: string): boolean {
  return output.includes('cache error at') && output.includes('No such file')
}

/** Whether `output` names a failure of msb's own shared SQLite state database (usually the concurrent-startup migration race). */
export function isMsbStateDbError(output: string): boolean {
  return output.includes('error: database error:')
}

/** Whether `output` names msb refusing to run anything while its internal install lock is held ("install operation in progress"). */
export function isMsbInstallLockActive(output: string): boolean {
  return /install operation (is )?in progress/.test(output)
}

/** Whether `output` (an early-exited `msb run` child's text) names a host-port bind conflict — msb has no structured error for it. */
export function isPortBindConflictOutput(output: string): boolean {
  const lower = output.toLowerCase()
  return (
    lower.includes('address already in use') ||
    lower.includes('port is already allocated') ||
    lower.includes('bind: address already in use') ||
    (lower.includes('already in use') && lower.includes('port'))
  )
}

/**
 * The closed classification of one `msb run` early exit, in upstream's
 * checked order (image-cache → state-db → install-lock → port-bind). The
 * runtime adapter retries or heals the first three per upstream's `start()`
 * policy; a port bind conflict escapes as the typed `PortBindConflictError`
 * the launch retry loop classifies.
 */
export type BootExitClassification =
  | { readonly _tag: 'image-cache-corruption'; readonly output: string }
  | { readonly _tag: 'state-db'; readonly output: string }
  | { readonly _tag: 'install-lock'; readonly output: string }
  | { readonly _tag: 'port-bind-conflict'; readonly output: string }
  | { readonly _tag: 'unknown'; readonly output: string }

/** Classifies one boot attempt's combined output, never throwing. */
export function classifyBootExit(output: string): BootExitClassification {
  if (isImageCacheCorruption(output)) {
    return { _tag: 'image-cache-corruption', output }
  }
  if (isMsbStateDbError(output)) {
    return { _tag: 'state-db', output }
  }
  if (isMsbInstallLockActive(output)) {
    return { _tag: 'install-lock', output }
  }
  if (isPortBindConflictOutput(output)) {
    return { _tag: 'port-bind-conflict', output }
  }
  return { _tag: 'unknown', output }
}

// ---------------------------------------------------------------------------
// Exec / snapshot wording
// ---------------------------------------------------------------------------

/**
 * Whether `stderr` (an `msb exec` invocation's stderr) says msb could not
 * reach the in-guest agent's endpoint at all, as distinct from the guest
 * command itself failing. A sandbox shows `"Running"` before the endpoint is
 * guaranteed to exist; only this exact framing is retried by the exec path.
 */
export function isAgentEndpointNotReady(stderr: string): boolean {
  return stderr.includes('agent client error') && stderr.includes('connect')
}

/** Whether `output` (an `msb snapshot inspect` failure) is msb's own "snapshot not found" framing — the ONLY non-zero probe exit that resolves `false`. */
export function isSnapshotNotFoundError(output: string): boolean {
  return output.includes('snapshot not found')
}

/** Whether `stderr` (an `msb snapshot load` failure) names msb's content-addressed dedup — for an import this IS success. */
export function isSnapshotAlreadyExistsError(stderr: string): boolean {
  return stderr.includes('snapshot already exists')
}

/** Whether `stderr` (an `msb snapshot save` non-zero exit) carries Windows `ERROR_ACCESS_DENIED` — msb's own archive writer hits this on every Windows save in 0.6.7/0.6.8. */
export function isSnapshotSaveAccessDeniedFailure(stderr: string): boolean {
  return stderr.includes('(os error 5)')
}

// ---------------------------------------------------------------------------
// Snapshot import digest-dirname derivation
// ---------------------------------------------------------------------------

/**
 * Extracts the digest-dir basename from one `msb snapshot load` invocation's
 * output. On both a success (stdout) and an already-exists failure (stderr),
 * the relevant trailing line ENDS with the artifact path under
 * `~/.microsandbox/snapshots/`, whose basename is the digest-derived
 * directory name (e.g. `sha256-b9c0448ee9d54e33`) — never the archive's own
 * recorded ref. `undefined` means the output carried no recognizable
 * trailing path.
 */
export function parseImportedDigestDirName(output: string): string | undefined {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const last = lines.at(-1)
  if (last === undefined) {
    return undefined
  }
  const match = /(\S+)\s*$/.exec(last)
  return match === null || match[1] === undefined ? undefined : basename(match[1])
}

// ---------------------------------------------------------------------------
// `msb snapshot list --format json` parsing + digest-dir confirmation
// ---------------------------------------------------------------------------

/** One `msb snapshot list --format json` entry — only the three fields the import confirmation reads. */
export interface SnapshotListEntry {
  readonly digest: string | undefined
  readonly name: string | undefined
  readonly artifactPath: string | undefined
}

/** Reads one string field from an unknown record value, returning `undefined` when absent or not a string. */
function jsonStringField(record: unknown, key: string): string | undefined {
  const value: unknown = typeof record === 'object' && record !== null ? Reflect.get(record, key) : undefined
  return typeof value === 'string' ? value : undefined
}

/**
 * Parses the array-of-objects output of `msb snapshot list --format json`.
 * Malformed/non-array JSON resolves to an empty list — the caller turns
 * "digest not found" into its own actionable error, so a parse failure
 * degrading to "found nothing" produces the same class of error.
 */
export function parseSnapshotList(json: string): SnapshotListEntry[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) {
    return []
  }
  return parsed.map((entry): SnapshotListEntry => ({
    digest: jsonStringField(entry, 'digest'),
    name: jsonStringField(entry, 'name'),
    artifactPath: jsonStringField(entry, 'artifact_path'),
  }))
}

/**
 * Confirms an imported snapshot's digest-dir basename appears in a parsed
 * snapshot list — an entry whose `name` equals it outright, or whose
 * `artifact_path`'s basename does. Returns `digestDirName` itself once
 * confirmed, NOT the entry's `digest` field: the full `sha256:<64hex>`
 * digest does not resolve as a snapshot ref, only the digest-dir name does.
 * `undefined` means no entry matched.
 */
export function confirmDigestDirNamePresent(
  entries: readonly SnapshotListEntry[],
  digestDirName: string,
): string | undefined {
  const present = entries.some(
    (entry) =>
      entry.digest !== undefined &&
      (entry.name === digestDirName ||
        (entry.artifactPath !== undefined && basename(entry.artifactPath) === digestDirName)),
  )
  return present ? digestDirName : undefined
}

// ---------------------------------------------------------------------------
// `msb ls --format json` — running/existing sandbox entries
// ---------------------------------------------------------------------------

/** One `msb ls --format json` entry — only the fields the backend reads. */
export interface LsEntry {
  readonly name: string | undefined
  readonly status: string | undefined
}

/**
 * Splits a top-level JSON array's text into its immediate object elements,
 * string- and escape-aware so a `}` or `,` inside a quoted value never
 * miscounts. Never throws: an unbalanced payload yields whatever complete
 * objects preceded the truncation.
 */
function splitTopLevelObjects(text: string): string[] {
  const objects: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let index = 0; index < text.length; index++) {
    const ch = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') {
      if (depth === 0) {
        start = index
      }
      depth++
      continue
    }
    if (ch === '}') {
      if (depth > 0) {
        depth--
        if (depth === 0 && start >= 0) {
          objects.push(text.slice(start, index + 1))
          start = -1
        }
      }
      continue
    }
  }
  return objects
}

/** Extracts a single string field's value from one object's raw text, tolerant of key order. */
function extractStringField(objectText: string, field: string): string | undefined {
  const re = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`)
  const match = re.exec(objectText)
  if (match === null || match[1] === undefined) {
    return undefined
  }
  return match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

/**
 * Parses every object of `msb ls --format json`. `JSON.parse` is tried first
 * for the common case; the tolerant string/escape-aware brace scanner
 * degrades gracefully on schema drift a future msb release might introduce.
 */
export function lsEntries(json: string): LsEntry[] {
  try {
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.map((entry): LsEntry => ({
      name: jsonStringField(entry, 'name'),
      status: jsonStringField(entry, 'status'),
    }))
  } catch {
    return splitTopLevelObjects(json).map((objectText) => ({
      name: extractStringField(objectText, 'name'),
      status: extractStringField(objectText, 'status'),
    }))
  }
}

/** The names of sandboxes whose `status` is exactly `"Running"` (capitalized). An entry missing `name` or `status` is skipped. */
export function runningNames(json: string): Set<string> {
  const names = new Set<string>()
  for (const entry of lsEntries(json)) {
    if (entry.status === 'Running' && typeof entry.name === 'string') {
      names.add(entry.name)
    }
  }
  return names
}

// ---------------------------------------------------------------------------
// Follow-logs replay math
// ---------------------------------------------------------------------------

/**
 * The lines still owed to a `followLogs` consumer: the full authoritative
 * tail, minus the `delivered` lines the live stream already produced.
 * Trailing-newline handling mirrors `msb logs`'s own output shape — a
 * complete log always ends with `\n`, which must not manufacture a phantom
 * empty final line; interior empty lines are real workload output and stay.
 */
export function undeliveredLines(fullTailText: string, delivered: number): string[] {
  const lines = fullTailText.split('\n')
  if (fullTailText.endsWith('\n')) {
    lines.pop()
  }
  return lines.slice(delivered)
}
