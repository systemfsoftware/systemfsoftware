---
"@systemfsoftware/effect-daemon-spec": patch
"@systemfsoftware/omp-claude-compat": patch
"@systemfsoftware/stryker-js-cli": patch
---

Express each executor's sandwich as a `Cell` description.

Every call site that previously sequenced the phases by hand now builds one description and hands it to the interpreter, so the order these executors run in is carried by the phase types instead of by the order the statements happen to appear in. Behaviour is preserved and no public surface moves: the change is confined to `src/internal/*.executor.ts`, and each package's golden API report is unchanged.

One site needed a real fix rather than a translation. `supervisor-body.executor.ts` wrote before it could classify — it recorded a restart, then read the resulting rate — which is a read that depends on an earlier decision. Its read now gathers the restart record and the resulting rate as one product, which keeps that site a single layer, with the intensity tracker passed as the read's command rather than captured from the surrounding scope.
