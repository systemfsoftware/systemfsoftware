---
"@systemfsoftware/effect-spec-runtime": minor
---

Cases now run on the simulation kernel: a case's layers build under the zero-preemption schedule, then the body runs under the profile's seeded schedules, and a case that must stay on the live clock declares a reason.

- `Suite.Bindings` takes only `it`: drop the `layer` helper from the bindings you pass.
- `Config.liveClock` becomes `Config.live`: `liveClock: true` → `live: { reason: '...' }`; `liveClock: false` → omit `live`.
- `Suite.LayerOptions` and `Shared.excludeTestServices` are gone: `Shared` is `{ layer }`, and the registrar takes an optional fourth `live` argument.
- Explored cases have no wall-clock timeout; a run is bounded in kernel steps, and a hang reports as a deadlock, a runaway, or a wait the kernel cannot observe.

`KernelCase` is a new barrel exporting `caseProgram`, `liveCase`, `explore`, `announceLive`, and the `LiveCase` reason type.
