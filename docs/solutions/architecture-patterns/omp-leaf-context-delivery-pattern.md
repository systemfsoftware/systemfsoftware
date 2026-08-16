---
title: Non-blocking leaf governance delivery through tool-result injection
date: 2026-08-16
category: architecture-patterns
module: omp-leaf-context
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - "porting a host-hook gate into a per-session extension"
  - "delivering path-scoped context to an agent session without blocking tools"
  - "authoring an OMP plugin that consumes tool_call / tool_result events"
tags: [omp, plugin, tool-result, agnets-md, delivery, dedupe, effect-v4]
---

# Non-blocking leaf governance delivery via tool-result injection

## Context

Root-cwd sessions of the coding agent only auto-read `AGENTS.md` files on the
cwd-to-repo-root walk; the ~30 leaf `AGENTS.md` files under `packages/` never
reach the agent. The previous closure was a Claude-format PreToolUse hook that
blocked the first write under a leaf (a deno process spawn per matching write)
and forced a separate read round-trip. The replacement is an OMP extension,
`@systemfsoftware/omp-leaf-context`, that appends the governing leaf's
`AGENTS.md` to the first tool result touching that leaf, once per leaf per
session, mirroring Claude Code's on-demand subdirectory memory on the host's
native `tool_result` modification surface.

## Mechanism

- `tool_call` events are ACL-decoded for a target string (`file_path` or
  `path`); a `TaggedError` `NoTarget` carries the no-target case instead of
  `null`. The decode is one `Schema.transformOrFail`-based ACL: foreign
  record to a branded target.
- The decision cell `decide` is the single source of both eligibility
  predicates: no governing leaf, the touched target IS the leaf, or the leaf
  is already delivered this session -> `Skip`; otherwise `Select`.
- The executor walks `dirname(target)` upward (skipping `repos/` entirely)
  until an existing `<dir>/AGENTS.md`, reads the leaf UNLESS a `Select` was
  refused, and materializes `Inject` with content. The dedupe step runs before
  any file read, so steady-state repeat touches cost one walk, zero reads.
- The result handler appends one text block (never replaces the result
  content): inline for leaves up to 6144 UTF-8 bytes, else a pointer marker.
- Containment is fail-open: a handler fault is logged and no-ops. I/O failures
  during the walk or read surface as a `LeafContextError` on the error channel
  (never a silent `Skip`); the error type is `S.TaggedError`, never
  `S.TaggedClass`.

## Architectural invariants

1. **Delivery is an emission, not a gate.** The plugin appends context to a
   tool result; it never blocks or revises a tool call. First mutations under
   a leaf may run before the leaf text arrives. The governing-row in the root
   repository manual must price the registration-liveness checks for what they
   are; delivery correctness is proven by the integration suite, not by
   `omp plugin doctor` or the smoke tool.
2. **Regulate, then read.** The per-session dedupe predicate must execute
   before any file I/O for that leaf, because the steady-state case is a
   repeat touch that will be discarded. The pure decision cell owns every
   skip reason (no leaf, self-injection, already delivered); the shell only
   reads a leaf once a `Select` exists.
3. **Result content is preserved, mutated by append.** Handlers may return a
   replacement `content` array; the contract is to spread the original content
   and append a text block at the end, never to substitute.
4. **Path scope derives from the session cwd.** Targets resolve against the
   extension context `cwd`; anything absolute outside root (or containing
   ascend segments) yields no leaf. Deliberate edge: a session started below
   the project root has no leaf delivery.
5. **State is process-lifetime and per-session keyed.** The maps live at
   module top level (the host re-imports the plugin entry per session);
   toolCallId keys are scoped by session id, dedupe sets keyed by session id.

## Why this matters

A non-blocking signal is easy to confuse with a silent loss. The original
blocking hook failed loud; the replacement fails soft, so its delivery and
its registration are separately verified: the package's vitest scenarios
drive a recording harness with the real wrapper contract; the live host
delivery was proven in a fresh session reading under two leaves and one
vendored subtree.

## When to apply

Use this shape when adding per-directory context to OMP sessions: deliver
on the first tool result that touches the unit, dedupe
once per session, and let the executor transfer any content; keep the
decision and the reading in different cells (the workflow cell in `decide`
style), and the I/O failure on the error channel.

## Related

- docs/solutions/architecture-patterns/constraint-reaches-only-via-window-or-gate.md
- docs/solutions/architecture-patterns/workflow-error-channel-gates.md
- docs/solutions/architecture-patterns/provenance-ritual-gates.md
- `ToolCallEvent` / `ToolResultEventResult` — the host surface the handler consumes (extensibility wrapper)
