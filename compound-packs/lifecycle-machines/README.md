# Lifecycle Machines Compound Pack

A lifecycle's transitions are declared once, in a `createFSM` table from `@systemfsoftware/xstate/fsm`, and its host follows its durability. The pack governs every lifecycle a product shows, stores or sends, on a server or in a UI: which values count as a lifecycle, how its table and guards are written, and where it runs. The fork is pinned at `c8c376cc2fd798c00c131185149fa6536cc3a027` (`systemfsoftware/xstate`, main, 2026-10-09). The pack has no lint; review is its gate.

Rules:

- `lifecycles-are-xstate-machines`: a value whose next named state code decides from its current state and an event, and that is rendered, persisted or sent, declares its transitions in a `createFSM` table; hand-written transition code is refused. Incident n (2026-10-10).
- `machine-guards-are-pure-and-effects-are-declared`: a guard reads only its `context` and `event`, and the table holds no side effects; the shell runs them after the transition. Incidents o and p (2026-10-10).
- `lifecycle-hosts-follow-durability`: a durable lifecycle is a stored value advanced by a decider that calls the table's `transition` and refuses an unchanged snapshot; an in-process one is an `EffectActor` the runtime owns, read only through runtime atoms. Incident q (2026-10-10) for the durable clauses; incident c (2026-10-11, shared with ui-state) and incident r (2026-10-10) for the in-process clause.

The adoption record, with the options weighed, the interop probes and the reasons for `/fsm` over the root package, is the Key Decisions section of `docs/plans/2026-10-12-1541-feat-ui-state-pack-plan.md`.

Owned elsewhere and cited, not restated: the shape of a state value as a closed tagged union (CONST-D4, `repos/constitution/CONSTITUTION.md:20-25`, and schema-laws `tagged-unions-over-state-by-presence.md`); the pure decider a durable lifecycle runs in (cell-architecture `pure-decision-workflows.md`); request progress as the `AsyncResult` of a runtime atom (ui-state `server-data-lives-in-atoms.md`); who may start an actor in a UI (ui-state `components-dispatch-to-runtime-atoms.md`); and the durable-runtime shape, "model the human/approval gate as a lifecycle state, not a callback" and "model the lifecycle as a pure `decide`/`evolve` fold over events; the imperative shell executes commands and appends events" (kb://software/durable-agent-runtime).
