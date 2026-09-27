---
"@systemfsoftware/stop-enrollment": minor
---

New `stop-enrollment` command: run it against a package and it fails the package for every unit — a Cell, a Blueprint, a Handle, or a `Supervisor.Medium` port — that no `Conformance.stopped` call reaches, naming each one and exiting non-zero until every unit has a stop rule. Run it per package as `stop-enrollment [--project <tsconfig>] [<packageRoot>]`, defaulting to the working directory and the package's test tsconfig; a package whose `test` script never runs the conformance project is named too. Enrollment follows from a unit's type rather than an opt-in marker, and kinds are found by package and export name, so it works in a repository that installs these packages.
