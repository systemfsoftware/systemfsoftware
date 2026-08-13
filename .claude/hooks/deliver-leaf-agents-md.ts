#!/usr/bin/env -S deno run --allow-env --allow-read --allow-write
// PreToolUse hook contract: exit 0 allows the write, exit 2 refuses it and the
// stderr text reaches the agent. Neither code is inferable from the source.
// Nothing below the root AGENTS.md auto-loads — work reaches a package through
// `pnpm --filter`, never `cd`, so a leaf is delivered only by being named here.
// Refuses the first write under each governing leaf once per session, then stops.
// Stats AGENTS.md for existence only and reads no doctrine file, so REPO-S6 and
// check:script-provenance stay satisfied.

import { dirname, isAbsolute, join } from '@std/path/posix'
import { toText } from '@std/streams'

export interface WritePayload {
  readonly tool_input?: {
    readonly file_path?: string
    readonly path?: string
  }
  readonly session_id?: string
}

export interface Facts {
  readonly root: string
  readonly alreadyStamped: (session: string, leaf: string) => Promise<boolean>
}

export type Verdict =
  | { readonly refused: false }
  | { readonly refused: true; readonly leaf: string; readonly reason: string }

const ALLOWED: Verdict = { refused: false }

/** existsSync replacement: false on any stat failure, never throws. */
const exists = async (path: string): Promise<boolean> => {
  try {
    await Deno.stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * bash `case "$target" in "$root"/*) strip ;; /*) pass ;; *) keep ;; esac`:
 * a target under the root is cut to its relative form, an absolute target
 * elsewhere is not this gate's business, a relative target is kept verbatim.
 */
export const relativeToRoot = (target: string, root: string): string | null => {
  if (target.startsWith(root + '/')) return target.slice(root.length + 1)
  if (isAbsolute(target)) return null
  return target
}

/**
 * Walk up from the target's directory; the first AGENTS.md below the root is
 * the governing leaf. Dirs at or below `repos/<name>` are skipped so a vendored
 * subtree's upstream AGENTS.md never governs — the walk keeps going to
 * `repos/AGENTS.md`, which is ours and is the file that says so (REPO-S3).
 */
export const governingLeaf = async (rel: string, root: string): Promise<string | null> => {
  let dir = dirname(rel)
  while (dir !== '.' && dir !== '/' && dir.length > 0) {
    const vendored = dir.startsWith('repos/') && dir.length > 'repos/'.length
    if (!vendored && await exists(join(root, dir, 'AGENTS.md'))) return `${dir}/AGENTS.md`
    dir = dirname(dir)
  }
  return null
}

export const stampPath = (session: string, tmp: string): string => join(tmp, 'claude-leaf-delivery', session)
export const stampName = (leaf: string): string => leaf.replaceAll('/', '_')

export const decide = async (payload: WritePayload, facts: Facts): Promise<Verdict> => {
  const target = payload.tool_input?.file_path ?? payload.tool_input?.path
  if (target === undefined || target === '') return ALLOWED

  const rel = relativeToRoot(target, facts.root)
  if (rel === null) return ALLOWED

  const leaf = await governingLeaf(rel, facts.root)
  if (leaf === null) return ALLOWED

  const session = payload.session_id ?? 'nosession'
  if (await facts.alreadyStamped(session, leaf)) return ALLOWED

  return {
    refused: true,
    leaf,
    reason:
      `Read ${leaf} before editing under ${
        dirname(leaf)
      }/ — it carries the deltas the root AGENTS.md omits for this directory. ` +
      'Then re-issue the same tool call. This gate fires once per leaf per session.',
  }
}

if (import.meta.main) {
  const raw = await toText(Deno.stdin.readable)
  let payload: WritePayload
  try {
    payload = JSON.parse(raw) as WritePayload
  } catch {
    // An unparseable payload must not brick every write; the guard declines to rule.
    Deno.exit(0)
  }

  const root = Deno.env.get('CLAUDE_PROJECT_DIR') || Deno.cwd()
  const tmp = Deno.env.get('TMPDIR') || '/tmp'
  const session = payload.session_id ?? 'nosession'

  const verdict = await decide(payload, {
    root,
    alreadyStamped: (s, leaf) => exists(join(stampPath(s, tmp), stampName(leaf))),
  })

  if (verdict.refused) {
    // A stamp-dir that cannot be created must not brick every write; the guard
    // declines to rule (bash: `mkdir -p "$stampdir" || exit 0`).
    try {
      await Deno.mkdir(stampPath(session, tmp), { recursive: true })
    } catch {
      Deno.exit(0)
    }
    try {
      await Deno.writeTextFile(join(stampPath(session, tmp), stampName(verdict.leaf)), '')
    } catch {
      // The stamp failed to record; still refuse this once — the next write
      // under the leaf is refused again (bash: `: >"$stamp"` has no guard).
    }
    console.error(verdict.reason)
    Deno.exit(2)
  }
  Deno.exit(0)
}
