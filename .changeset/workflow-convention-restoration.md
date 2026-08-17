---
'@systemfsoftware/oxlint-plugin-effect-workflow': minor
'@systemfsoftware/oxlint-plugin-effect-schema': minor
'@systemfsoftware/oxlint-plugin-test-placement': major
'@systemfsoftware/oxlint-plugin-effect-dmmf': major
---

Three new rules, a retargeted test-placement taxonomy, and one removal.

`make-file-location` allows a workflow constructor only in the workflow module that owns it, at most once per module.

`schema-declaration-location` requires a schema declaration to live in a schema module, or the workflow module that owns it. A binding whose initializer returns something other than a schema — a type guard, a decoder, an encoder, an arbitrary — is a use and is not reported.

`test-placement` narrows which tests may sit beside source, requires every other test to live in the package test directory, and adds `tests-dir-helpers-in-fixtures`. It also removes `in-source-test-targets-private`, which `effect-dmmf` no longer re-exports — drop the entry if you set it. Each rule reports the exact shape it expects.
