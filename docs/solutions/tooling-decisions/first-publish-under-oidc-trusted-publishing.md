---
title: First publish under npm OIDC trusted publishing
date: 2026-08-11
last_updated: 2026-08-20
category: tooling-decisions
module: release-tooling
problem_type: tooling_decision
component: tooling
severity: high
applies_when:
  - Adding a new publishable package under packages/
  - A release fails with an npm OIDC auth error
  - Deciding what version string a new package's manifest carries
tags:
  - release
  - npm
  - oidc
  - trusted-publishing
  - pnpm
---

# First publish under npm OIDC trusted publishing

## Context

npm OIDC trusted publishing cannot debut a package. npm's `npm trust`
prerequisites require the package to already exist on the registry — "Package
must exist" (https://docs.npmjs.com/cli/v11/commands/npm-trust/). There is no
pre-registration path: a trusted publisher can only be registered _for_ an
existing package. Every new package must therefore be published once by some
other credential, from a maintainer machine, before CI can take over with OIDC.

This is a real, currently-painful gap in this repo. The release-time preflight
added for it measures the exposure live: the workspace publish-status checker's
`--preflight` mode, run 2026-08-11 against
`https://registry.npmjs.org` reported **20 of 46** non-private workspace
packages as 404-on-npm (never published), and exited 1. Without the gate,
`pnpm -r publish` would attempt all 20 mid-batch, hit an OIDC auth error on
the first unregistered one, and leave a partial publish behind.

## Guidance

Two rules settle the two questions this learning answers.

### The debut version is the manifest version — `0.0.0-development` is rejected

`0.0.0-development` is a semantic-release convention, not pnpm guidance.
semantic-release computes the version from commit history at publish time and
never writes it back, so the committed `version` must be an obviously-fake
placeholder.

This repo left semantic-release (2026-08-10) for pnpm-native intent versioning,
where the manifest `version` **is** the source of truth. pnpm's own docs —
https://pnpm.io/versioning, "First releases", behaviour added in v11.16.0 —
state that _"the first release of a package publishes the version written in
its manifest verbatim, instead of bumping off it… when that version is not yet
published, the package debuts at it and its pending change intents apply only
from the next release."_

A manifest reading `0.0.0-development` would publish a package whose literal
first release on npm is `0.0.0-development` — the placeholder ships as the
debut version. Adopting the convention would break the release model, not
support it.

**Rule:** a new package's manifest `version` is its intended debut version.
Set it to what the package should debut at (e.g. `0.1.0`); that exact string
is what npm will carry.

### The chicken-and-egg resolves with a one-time local bootstrap, then CI takes over

Because a trusted publisher cannot be registered for a package that does not
exist, the debut publish happens from a maintainer machine. This is a
once-per-package cost.

## Runbook — bootstrap a new package for OIDC publishing

The whole sequence (steps 2–5 below) is automated by
`scripts/tools/publish-and-setup-npm-trust.ts` (run via `pnpm publish:unpublished
-- --dry-run` to preview, or plain `pnpm publish:unpublished` to execute): it
discovers the non-private workspace set the same way, publishes every package
npm returns 404 for, then registers the trusted publisher for each one just
published. The manual steps remain below in case a single package needs the
treatment by hand.

One-time, per package, from a maintainer machine:

1. **Manifest carries the debut `version`**, and `repository.url` exactly
   `git+https://github.com/systemfsoftware/systemfsoftware.git` with the
   right `repository.directory`. npm rejects a mismatch — _"To publish from
   GitHub, your package's `repository.url` field in `package.json` must
   exactly match your GitHub repository."_ `pnpm check:publish-config` already
   gates this.
2. **`corepack pnpm --filter <pkg> build`** — mandatory. Most packages
   publish `files: ["dist"]` against a gitignored `dist/` with no `prepack`
   hook, so the build is an explicit step (the release workflow's Build step
   states this at `.github/workflows/release.yml:85-88`). Two packages —
   `@systemfsoftware/arethetypeswrong-cli` and `@systemfsoftware/arethetypeswrong-core`
   — carry `"prepack": "pnpm build"` (`packages/arethetypeswrong/cli/package.json:32`,
   `packages/arethetypeswrong/core/package.json:27`), so a bare `pnpm publish`
   builds them implicitly; the explicit build is still required for every
   other package.
3. **`corepack pnpm --filter <pkg> publish --access public --no-git-checks`**
   from a maintainer machine. pnpm prompts for the 2FA OTP or prints a web-auth
   QR. `pnpm --filter <pkg> publish` selects exactly that package and honours
   the "skip already-published" rule.
4. **`npm trust github <pkg> --repo systemfsoftware/systemfsoftware --file release.yml --allow-publish --yes`**
5. **`npm trust list <pkg>`** to confirm the GitHub Actions publisher is
   registered against `systemfsoftware/systemfsoftware` + `release.yml`.
6. **Every later version ships from CI** with OIDC + provenance. Record the
   change with `pnpm change --bump <patch|minor|major>` as normal.

> These exact commands (steps 2–4) are what the preflight prints per
> unpublished package.

### Prerequisites for step 4

Not all are satisfied on a default workstation:

- **npm ≥ 11.15.0** — required for `npm trust`; an unknown-command error means
  the installed npm is older. Measured on this workstation: **11.9.0**. Upgrade
  with `npm install -g npm@^11.15.0`, or invoke once without upgrading via
  `npx npm@^11.15.0 trust github …`.
- **Node ≥ 22.14.0** — satisfied on this workstation (24.14.0).
- **Account-level 2FA enabled** — required by `npm trust`.
- **A Granular Access Token with the _bypass 2FA_ option will not work** for
  `npm trust`; it needs an interactive 2FA challenge.

### Why `--file release.yml`

`--file` names the workflow file containing the publish step. npm's docs warn
that with `workflow_call`, validation checks the _calling_ workflow's name. In
this repo only the `gate` job is a `workflow_call`
(`.github/workflows/release.yml:57`, `uses: ./.github/workflows/reusable-checks.yml`);
the `publish` job's steps are defined inline in `release.yml`, so
`release.yml` is the correct value.

### The debut version carries no provenance attestation

A local publish has no CI OIDC identity to attest with, so the debut version
ships unattested. Every subsequent version is published from CI with
provenance. One unattested version per package is the accepted cost of not
reintroducing an `NPM_TOKEN` secret for a once-per-package operation.

### Bulk mode

The first `npm trust` call triggers 2FA and offers a "skip 2FA for the next 5
minutes" option on npmjs.com. With a 2-second sleep between calls, roughly 80
packages fit in that window — enough to bootstrap the full unpublished set in
one sitting.

## Why This Matters

A release that fails with an npm OIDC auth error is not a transient failure; it
is the system telling you a package has never been published and no trusted
publisher can exist for it yet. The failure mode is the worst kind: `pnpm
publish -r` publishes the packages it can reach, then aborts on the first
unregistered one, leaving a **partial publish** on the registry and a half-done
release. The `--preflight` gate converts that silent partial publish into a
loud, zero-side-effect failure _before_ the multi-minute build and any publish.

The `0.0.0-development` question matters because it is a plausible-looking
convention that would corrupt every new package's debut version. A team member
adopting it "because semantic-release used it" would publish packages whose
first npm release is literally `0.0.0-development`, permanently polluting the
tag history. The rule here — manifest version IS the debut version — is the
correct replacement.

## When to Apply

- **Adding a new publishable package under `packages/`** — set its manifest
  `version` to the intended debut, then run `pnpm publish:unpublished` once
  (it publishes the new package and registers its trusted publisher).
- **A release fails with an npm OIDC auth error** — run the workspace
  publish-status checker with `--preflight`; it names every never-published
  package with its bootstrap commands. The published-but-unregistered class is
  not the preflight's job (it cannot read registration without authenticating);
  `npm trust list <pkg>` per package covers that.
- **Deciding what version string a new package's manifest carries** — the
  answer is always the debut version, never a semantic-release placeholder.

## Examples

**Gate observation (the RED evidence).** The preflight, run 2026-08-11 against
registry `https://registry.npmjs.org`, printed an `::error::` line —
"preflight failed — 20 package(s) have never been published, 0 unqueryable" —
then one block per never-published package (e.g. `@systemfsoftware/effect-cell-types`,
`@systemfsoftware/storybook-gherkin`) with its three bootstrap commands, and
exited 1.

**The classifier's mechanics.** Every non-private workspace package is placed in
exactly one class from two facts — the registry snapshot and the local manifest
version:

| Class         | Meaning                                                     | Preflight verdict |
| ------------- | ----------------------------------------------------------- | ----------------- |
| `unpublished` | 404 on the registry — never published                       | **fails**         |
| `error`       | the registry could not be read                              | **fails**         |
| `no-oidc`     | published, latest version carries no provenance attestation | passes            |
| `stuck`       | published and attested, local version ahead of the registry | passes            |
| `ok`          | published, attested, local matches the registry             | passes            |

`error` fails alongside `unpublished` because absence of evidence that a package
exists is not evidence that it does; a network fault must never read as `ok`.
`no-oidc` is deliberately a non-failure — a previously unattested version says
nothing about whether a trusted publisher is registered now, and registration
cannot be read without authenticating. This is a publishability preflight, not a
registration preflight.

**A full single-package flow.** For a genuinely new package:
(`package.json` `version: "0.1.0"`, correct `repository.url`) →
`corepack pnpm --filter <pkg> build` →
`corepack pnpm --filter <pkg> publish --access public --no-git-checks` →
`npm trust github <pkg> --repo systemfsoftware/systemfsoftware --file release.yml --allow-publish --yes` →
`npm trust list <pkg>`. The debut lands at `0.1.0`, unattested; the next
version ships from CI with an OIDC provenance attestation.

## Prevention

The never-published class is **deferred, not prevented**. Two facts force that
shape: OIDC cannot debut a package, and a recursive publish that meets one
mid-batch aborts after publishing its predecessors. So the release pipeline
partitions instead of blocking:

1. The publish-status checker names the deferred set twice — as `pnpm --filter`
   exclusions, and as bare package names.
2. The exclusions keep the deferred package out of the recursive publish, so
   every publishable package still ships.
3. The bare names keep it out of the tag and GitHub-Release steps. A tag and
   release for a version the registry never received is a release nobody can
   install — a tombstone that misinforms anyone reading the release history.
4. The release planner subtracts the deferred set from the owed set. Counting an
   unreleasable package as owed would pin the phase at `publish` permanently and
   stop every pending change intent from ever being consumed; the planner
   annotates each deferred package on every release run instead.
5. The preflight runs **last** and ends the run red, naming the package. Placing
   it first would block the packages that can ship on one that cannot.

The remedy is a maintainer's, never CI's: publish the debut from a maintainer
machine, then register its trusted publisher. The next push retries only what is
still owed.

## Related

- `publish-and-setup-npm-trust` — automates the runbook: publishes every
  unpublished non-private package, then registers the trusted publisher for each
  one just published (root script alias `publish:unpublished`).
- The CI-failure runbook under `.github/` — the `publish` job's step order, the
  deferred-set partitioning, and the OIDC publish invocation.
- `docs/solutions/runtime-errors/pnpm-internal-range-breaks-recursive-versioning.md`
  — the pnpm-native recursive-versioning failure that shaped the release model
  this runbook serves.
