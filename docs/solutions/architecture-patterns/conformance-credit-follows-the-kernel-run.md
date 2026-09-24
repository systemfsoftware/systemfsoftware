---
title: Conformance Credit Follows the Kernel Run, Not a Wall-Clock Window
date: "2026-09-24"
track: knowledge
problem_type: architecture_pattern
category: architecture-patterns
module: packages/toolchain/vitest-config
component: conformance coverage gate
tags: [conformance, attribution, kernel, concurrency, vitest]
severity: high
captured: 2026-09-24
last_updated: 2026-09-24
---

# Conformance Credit Follows the Kernel Run, Not a Wall-Clock Window

## Context

The conformance coverage gate credits a source site to a check when the check's
program reaches it. The first credit model opened a window for the whole
`Kernel.run` / `Kernel.search` call and credited every hit inside it to every
check whose window was open.

That model was written when a test file ran one test at a time. The fork now
runs tests in a file concurrently and shuffled, so a plain test's fiber executes
inside a check's window and its site hits are credited to a check that never
touched them. The report then says a site is exercised under a check when only a
concurrent plain test reached it.

## The failure

Attribution by wall-clock window conflates two things that are only coincident
under sequential tests: "a check is running" and "this hit belongs to that
check". Under concurrency the second no longer follows from the first, and the
error is silent — the gate goes green.

## The fix

Credit a hit only while the live kernel reports it is inside a synchronous step
(`Kernel.isStepping()`, backed by the kernel's `phase === 'step'`). One kernel
run is live per process, and it runs one task per step synchronously; a plain
test's fibers run between steps, so their hits earn no check credit. A run's own
work that arrives through a host timer outside the step loop is not credited
either: that callback did not run under the kernel, and the check that expects it
must make its delivery run under the kernel instead.

Runs still overlap a check's wall-clock span — only the credit is narrowed.

## When to apply

Any measurement that attributes an event to one of several interleaved drivers
must key on the driver's own execution identity, not on a time window that
happens to be open. A window is a proxy that holds only while nothing else can
interleave; the moment the harness gains concurrency, the proxy silently
misattributes.
