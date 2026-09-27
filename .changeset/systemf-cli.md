---
"@systemfsoftware/systemf": minor
---

New `systemf` command. `systemf check` fails a package for every unit — a Cell, a Blueprint, a Handle, or a `Supervisor.Medium` port — that no `Conformance.stopped` call reaches, naming the unit, the fix, and the follow-up, and exiting 1 until every unit has a stop rule. Enrollment follows from a unit's type rather than an opt-in marker, and kinds are found by package and export name, so it works in a repository that installs these packages.

The rest of the tree is machine-readable: `systemf check --json`, `systemf unit list`, `systemf unit show <module>`, and `systemf manifest --json`, which carries every command, flag, argument, result type, exit code, and `ERR_*` code. A package adopts the gate with `"check:systemf": "systemf check"`.
