# OMP Plugin — Supreme Engineering Constitution TTSR Rules

Time-Traveling Stream Rules (TTSR) plugin for Oh My Pi (OMP) and Claude Code that enforces strict adherence to the [System F Software Engineering Constitution](https://github.com/systemfsoftware/constitution).

## Overview

This plugin installs active stream rules that intercept edits, writes, and reviews violating constitutional articles:
- **`rules/constitution-pure-core.md` (Article I):** Intercepts impure logic (exceptions, I/O in decisions), primitive obsession, procedural control flow (cyclomatic complexity > 1 in core), and unvalidated states.
- **`rules/constitution-boundary.md` (Article II):** Intercepts decisions in boundary adapters, eager async promises on public domain surfaces, unchecked type casts (`as any`), and interleaved I/O sandwiches.
- **`rules/constitution-verification.md` (Article III):** Intercepts mocks on single implementations, tautological/characterization tests, private helper unit tests, and dependent oracles.
- **`rules/constitution-conduct-review.md` (Article V & Governance):** Enforces mandatory **P0** automatic failure on all undeclared constitutional violations with zero appeals and zero waivers (`CONST-G3`).

## Installation

Install in OMP:

```bash
omp plugin install @systemfsoftware/omp-plugin-constitution
```

Or link directly in local development:

```bash
omp plugin link ./plugins/constitution
```

## License

Apache-2.0
