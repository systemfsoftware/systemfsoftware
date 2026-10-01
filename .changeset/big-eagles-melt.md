---
"@systemfsoftware/oxlint-plugin-effect-schema": major
"@systemfsoftware/oxlint-plugin-dmmf-workflow": major
"@systemfsoftware/oxlint-plugin-test-discipline": major
---

Rules recognize effect 4.0.0 module paths: `effect/Arbitrary` (and the root `Arbitrary` name), `effect/process/ChildProcessSpawner`, and the `effect/encoding` codecs. A module is judged the same whether it is imported from `effect`, from an `effect/<area>` barrel, or by its own subpath. `schema-file-imports-pure-modules-only` admits `Base64`, `Base64Url`, `Hex` and `EncodingError` from `effect/encoding` in place of the removed `Encoding` module.
