# Recovery

## Diagnose

Preserve the run and identify the exact instruction, process result, native session, and failure from `state.json`, `events.jsonl`, and the stage logs. The failing instruction names the file to read.

Always read the launcher's own output after a resume. A refused launch says so there and nowhere else, which is how a cell that is merely unable to start comes to look dead.

`state.json` reports what the runner last wrote, never what is true now. A record can read `running` after its runner is gone, and a record can read `interrupted` while the cell is being carried forward by other means. Establish the cell's actual condition from log growth first, as [measurement/running.md](../measurement/running.md) defines it, and read the status as one input rather than as the answer.

Copy `state.json` aside before resuming. A resume overwrites the retained interruption record, so the cause of the stop survives only in the copy taken before the command that clears it.

A failure notice reaches you well after the event it describes. Read the record before acting on one, or you will diagnose a cell that has already moved.

When the resume conditions below match, resume immediately after diagnosis and any required runner correction. Do not wait for operator prose or the next reporting interval.

## Recover A Hung Turn

A turn whose process is resident while its stage log has not grown past the silence threshold is hung. It never ends, never fails, and never releases the thread, so waiting has no outcome.

Stop that turn's process, free the cell's ports, and resume the run. A hung turn is recovered exactly like a dead one; the only difference is that you must end it yourself first.

Record the last stage the log reached before the silence. The work that turn performed is in the workspace and is not attributed in the record.

## Never Restart A Finished Sequence

A cell whose objectives are exhausted is silent for the right reason. Restarting it writes unrequested work into a workspace that was complete, and that work cannot afterwards be told apart from the measured run.

Before resuming any silent cell, confirm it has an objective left. Where the runner no longer owns a cell its status cannot answer this, so the operator records the exhaustion and the supervisor reads that record. A silence threshold alone cannot distinguish a finished cell from a stopped one and must never be the only condition on a restart.

## Free The Cell's Ports

A cell never contends with another cell — the blocks are disjoint, and [measurement/running.md](../measurement/running.md) maps them. A cell contends with its own past: a killed runner leaves its API server, Swagger, Vite, and Playwright children holding that block, and the next launch fails its pre-launch port check.

Before resuming a stopped cell, confirm its four ports have no listener and stop whatever holds one. A listener on a cell's port while no runner of its own is alive means orphans are blocking recovery, and the reporting subagent reports that as its own condition rather than as a dead cell.

## Resume The Same Run

Resume only when the cell identity, frozen inputs, workspace, CLI version, objective, and native checkpoint still match:

```bash
pnpm --filter @ttsc/benchmark-evidence start codex <subject> <evidence|plain> <model> <effort> <run-id>
```

Repeat that cell's own model and effort rather than the campaign default. The runner compares engine, subject, arm, model, effort, run ID, stop point, and ledger mode against the retained cell and refuses the resume on any difference.

Keep the cell's original `benchmarkRevision` frozen. When recovery requires a committed runner correction, resume only from a clean descendant revision, which the runner retains as the new process's `runnerRevision`.

Before continuing, the runner revalidates the stored cell, instruction bytes, workspace, artifact digest, CLI, session, Goal, and token boundary. Codex may resume an exact retained Goal checkpoint.

One retained status refuses resume outright:

- `checkpointed` — the run was stopped deliberately after `backend-start` and continues only as a derived run.

`quality-failed` does not. It belongs to the earlier behaviour, where exhausting a scope's supplementations ended the cell; a run retained under it resumes and continues from the boundary its plan already points past. Failing the last permitted supplementation now dispatches that scope's Final, so the status a current run reaches is `completed` whether its scope converged or not. [measurement/plain-review.md](../measurement/plain-review.md) owns what the verdicts then have to say.

If the resume itself fails, preserve that attempt, diagnose the new failure, and recover again from the last exact checkpoint. Never abandon a cell, and never loop without evidence.

## Derive A Run From The Backend-Start Checkpoint

After `backend-start` completes, the runner stores a durable checkpoint of the material workspace, prepared Git baseline, native session and terminal turn, CLI version, token boundary, input digests, and inherited timing. It is a recovery point for a later downstream-instruction correction, not permission to modify an active measured workspace.

When a defect is confined to an instruction after `backend-start`, preserve the source run and create a new checkpoint-derived run:

```bash
pnpm --filter @ttsc/benchmark-evidence start codex <subject> <evidence|plain> <model> <effort> --from-backend-start <source-run-id>
```

The command then:

1. Verifies the retained cell and the exact completed `backend-start` boundary.
2. Restores that workspace, reinstalls its dependencies, and revalidates the restored digests.
3. Reapplies the current non-product instruction surface — `AGENTS.md` and `.agents/`.
4. Forks the native thread through the retained terminal turn.
5. Starts the new run at `backend-review` with the current downstream instructions.

An explicit operator launch does not reject the checkpoint because repository inputs changed after it was created.

Never edit a checkpoint, its source run, or its retained state.

A derived run has a new run ID and records its source lineage and inherited timing. Report inherited and continuation measurements together, and never describe it as resuming the original run.

## Cancel The Campaign

Stop the reporting subagent and every liveness watcher first, then force-stop every benchmark command, native process, and owned descendant. Verify that no process still references an affected run.

Preserve every run directory and report each cell as incomplete. Never delete one and never mark it complete.
