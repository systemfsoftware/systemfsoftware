# @systemfsoftware/vitest@4.1.1

Published declaration files no longer carry the rolldown-plugin-dts patch; they come from rolldown-plugin-dts 0.28.8, which includes the same fix upstream.

The property-check defaults no longer read `process.env` when a browser runner exposes a `process` with no `env`; there the record is empty, as it already was when `process` is absent.

`@systemfsoftware/effect-schema-discovery` is rebuilt against the updated `@systemfsoftware/vitest`; its own behavior is unchanged.
