---
'@systemfsoftware/effect-daemon-spec': none
'@systemfsoftware/effect-schema-extensions': none
'@systemfsoftware/hex-schema': none
'@systemfsoftware/omp-agent-discipline': none
'@systemfsoftware/omp-claude-compat': none
'@systemfsoftware/stryker-js-cli': none
'@systemfsoftware/stryker-test-contribution': none
---

Transitive build-hash ripple from `@systemfsoftware/stryker-js-platform-node` exporting `IncrementalReportSchema`: each of these packages re-hashes because it depends on the platform node build task, but none of them emits a new or changed symbol, type, or behaviour for a consumer. The only consumer-observable change in this set is the new `IncrementalReportSchema` export on `@systemfsoftware/stryker-js-platform-node` itself.
