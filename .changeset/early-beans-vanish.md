---
"@systemfsoftware/oxlint-config-recommended": major
---

Set the Effect-native checks that mirror the @systemfsoftware/tsconfig language-service diagnostics to `error` in the recommended config, in library, test and entry files: `global-json`, `global-json-in-effect`, `prefer-schema-over-json`, `global-fetch`, `global-fetch-in-effect`, `crypto-random-uuid`, `crypto-random-uuid-in-effect`, `global-random`, `global-random-in-effect`, `global-console`, `global-console-in-effect`, `process-env-in-effect` and `try-catch-in-effect-gen`. `global-json`, `global-fetch-in-effect` and `global-console-in-effect` were off pending adoption, and `prefer-schema-over-json` was in no @effect/tsgo preset so the config never enabled it; the others are now named in the config rather than inherited from a preset, so a preset release cannot lower them. Consumers with findings must fix them or extend the config and turn a rule off with a recorded reason.
