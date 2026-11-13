# @systemfsoftware/effect-schema-discovery@2.0.6

The property-check defaults no longer read `process.env` when a browser runner exposes a `process` with no `env`; there the record is empty, as it already was when `process` is absent.

`@systemfsoftware/effect-schema-discovery` is rebuilt against the updated `@systemfsoftware/vitest`; its own behavior is unchanged.
