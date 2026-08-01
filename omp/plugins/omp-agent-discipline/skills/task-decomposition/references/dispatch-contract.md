# The Dispatch Contract — bundle completeness, output rejection, repair-retry

Load this when PREPARING a dispatch or ACCEPTING/REJECTING a worker's result.

## The dispatch bundle — all fields required

A dispatch is a file, not a chat message. Write it to disk; pass the path. Required fields:

1. `objective` — one sentence: what exists after this unit that did not exist before
2. `write_scope` — explicit file/glob ownership; the worker modifies nothing outside it
3. `verify_commands` — exact runnable checks for this unit (argv, cwd, timeout), scoped to the increment
4. `acceptance` — observable behavior a reviewer can confirm on this increment alone
5. `size_estimate` — expected files / verify minutes; must fit the assigned worker's class budget
6. `context_paths` — the exact files the worker must read first (upstream specs, relevant source)
7. `rollback` — recovery path if the unit leaves a partial state
8. `dependencies` — units that must complete first; absent means parallel-eligible ONLY if write scopes are disjoint
9. `worker_class` — the model class assigned to this unit, derived from `size_estimate.files` against `delegation.unit_budgets`. One of `frontier` | `cheap_agentic` | `small_local`. Operators may override; the runner defaults to the cheapest class that fits.

If any field is unfillable, the task is not decomposed enough. Do NOT dispatch and "let the worker figure it out" — that is the monolithic-dispatch failure wearing a smaller costume.

## Vague dispatch is invalid

These are not dispatches: "implement auth", "review this phase", "fix the tests", "handle the backend". Each lacks verifiable acceptance and a bounded scope. The correct move when you catch yourself writing one: decompose further, or do the work yourself sequentially. An orchestrator doing a small unit inline is cheaper than a worker doing a big unit badly.

## Output rejection rules — reject when ANY hold

- No explicit verdict / completion claim
- Claims files changed but doesn't list them, or the list doesn't match the actual diff
- Doesn't cite which spec/context files it read
- Ran no verify commands, or ran different ones than specified, or can't show output
- Generic praise of its own work ("everything looks good") with no grounded findings
- Touched files outside the declared write scope (fence breach — also a severity escalation)
- Output can't be checked without trusting the worker's reasoning — the check must be against reality (diff, files, command output), never against the worker's narrative

## Acceptance protocol

1. Diff the write scope: every claimed file appears in the actual diff; nothing outside scope changed.
2. Run the unit's verify commands FRESH — not the worker's reported output, your own run.
3. Check acceptance behavior on this increment alone.
4. Only then mark the unit complete and allow dependent units to start.

## Repair-retry protocol

When a unit fails:

1. Record the failure evidence (which verify command, what output).
2. Re-dispatch the SAME unit to a fresh worker with the exact failure named and the corrected spec. Do not patch worker output yourself and mark it done — that hides the failure rate you need for calibration and breaks maker/checker separation.
3. A re-dispatch with an IDENTICAL spec after an identical failure is no-progress: change the mechanism (smaller unit, different model class, clarified acceptance) or escalate to the operator.
4. Three failures of the same unit under materially different mechanisms → park the unit for a human; the spec itself is likely wrong.

## Durable action records

Every dispatched unit leaves a record: bundle path, worker identity/model, claimed changes, verify output paths, verdict, acceptance decision. Chat logs are not records — they compact away. The record is what lets a fresh agent audit the delegation chain later without trusting anyone's summary.
