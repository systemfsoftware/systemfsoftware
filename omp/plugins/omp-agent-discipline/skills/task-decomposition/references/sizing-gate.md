# The Sizing Gate — when decomposition is mandatory and how small a unit must be

Load this when deciding WHETHER to decompose and HOW SMALL units must be.

## Gate criteria — any one fires, decomposition is mandatory

1. **Multi-subsystem** — the change touches more than one architectural layer (UI + state + persistence + backend). Each subsystem boundary crossed is coordination surface a single worker must hold in context at once.
2. **Exceeds one focused session** — the work cannot be completed by one worker in a single focused sitting for its model class. This is the primary "takes too long to run" trigger: a worker that must compact its context mid-task starts making decisions on rotted context.
3. **Irreversible side effects** — migrations, deletions, external API writes. Smaller units bound the blast radius of each irreversible step and put a verification gate between them.
4. **Verification longer than the work** — if reviewing the whole result would take longer than producing it, the unit is too big by definition. Verification cost scales with the diff surface; outcome-only verification is the weakest signal available.

If NONE fire, decomposing is usually wrong: more units = more coordination, more handoffs, more chances for inter-agent misalignment. One maker by default; decompose on evidence, not on vibes.

## Model-relative budgets

The same task is a different-sized unit for different workers. Attention reliability over long contexts degrades more sharply in smaller models, so a cheap-agentic worker's unit must be smaller than a frontier worker's:

| Worker class  | Examples                                        | max files | max verify minutes | Notes                                           |
| ------------- | ----------------------------------------------- | --------- | ------------------ | ----------------------------------------------- |
| frontier      | top-tier proprietary models                     | ~12       | ~15                | still bounded — frontier models rot too         |
| cheap_agentic | M3-class MoE (~23B active), strong open-weights | ~5        | ~6                 | economics only pay off inside the reliable zone |
| small_local   | 7–13B local models                              | ~2        | ~3                 | narrow specialists only; keep scopes tiny       |

These are STARTING DEFAULTS, not measured truths — no published benchmark measures agentic unit-size vs. model class directly. Calibrate per host (below) and record the calibrated values where the orchestrator reads them (loop kit delegation block, project config).

## Calibration procedure

1. Pick 5–10 real past tasks and their actual diffs (files touched, verify runtime).
2. Run them as single units with the target worker class; record where failures correlate with size (typically: instruction drift, scope creep, verify commands skipped).
3. Set max_files at the point below which failures were NOT size-correlated; set max_verify_minutes so the per-unit check finishes in a fraction of the unit's work time (target ≤ 25%).
4. Revisit when the worker model changes — class assignment is per-model, not per-run.

## Edge cases

- **The unit that can't shrink**: some changes are atomic (a schema migration touching 40 call sites). Decompose by PHASE instead: one unit writes the migration + adapter, follow-up units migrate call-site clusters. The write scope is still bounded per unit even though the change is logically one.
- **Unknown size upfront**: when the scope fence can't be drawn until exploration happens, dispatch a read-only scout unit first (tiny scope, report-only), then size the write units from its map. Never convert a scout into a writer mid-task — its context is optimized for breadth, not depth.
- **Sequential dependency chains**: units with blocking dependencies serialize by definition. State the dependency in the unit spec so the scheduler doesn't fan them out.
- **Re-dispatch after failure**: a failed unit re-dispatched with a corrected spec is a NEW unit — its spec must name the prior failure and what changed. A re-dispatch with the identical spec is a no-progress signal, not work.
