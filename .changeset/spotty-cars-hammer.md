---
"@systemfsoftware/effect-microsandbox": patch
---

effect-microsandbox now builds its virtualization preflight on @systemfsoftware/effect-cell-types, adding it as a runtime dependency; verdict selection and remediation rendering are decided by a typed virtualization-verdict cell. Plan rendering and wait defaults are unchanged.
