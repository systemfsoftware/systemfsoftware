---
title: "fix: boot microVM test images from a mirror, not anonymous Docker Hub"
type: fix
status: active
date: 2026-10-09
---

# fix: boot microVM test images from a mirror, not anonymous Docker Hub

## Problem

Main CI on `cf6ab028` (run 37991399366, attempt 1) failed in the smoke job and in the test job that runs `effect-daemon-microvm`. Every failure is the microVM image pull:

- smoke (job 114026241334): `url https://index.docker.io/v2/library/alpine/manifests/3.20 … You have reached your unauthenticated pull rate limit`.
- test (job 114026477727): five `effect-daemon-microvm` integration scenarios, `url https://index.docker.io/v2/library/alpine/manifests/sha256:d9e853e8… Not authorized` or the same rate-limit error.

GitHub-hosted runners share egress IPs, so the anonymous Docker Hub budget is spent before our jobs start.

## Findings that correct the brief

- The `effect-microsandbox` tests never pull. Both of its tests that name `alpine:3.20` (`tests/boot-microvm-refusals.integration.test.ts`, `tests/boot-sandbox-release.conformance.test.ts`) run against a recording fake `SandboxRuntime`; the string is an inert label. In the test job only `effect-daemon-microvm` failed.
- The smoke journey J15 boots `effect-microsandbox-refusal-does-not-exist:0.0.0`, a bare name, so it also sends an anonymous request to `index.docker.io` on every run. It passes today only because any refusal counts.
- No log line on a successful boot names the image today (green smoke run 37986976127 shows only `microsandbox runtime resolved`), so "logs show the image pulled from the new source" needs a log line.
- The `3.20` tag still resolves to the pinned index digest on all three registries (probe on 2026-10-09: `HEAD /v2/…/alpine/manifests/3.20` on `public.ecr.aws/docker/library` and `mirror.gcr.io/library` both return `docker-content-digest: sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc`, the digest the daemon fixture pins; the same digest also resolves by digest on both). The smoke can take the digest pin without changing content.

## Where Docker Hub comes from (library default, not patched)

`microsandbox@0.7.2` parses every image string as `oci_client::Reference` (`crates/image/lib/lib.rs:54`, `pub use oci_client::Reference`). `oci-client@0.17.0` re-exports `oci_spec::distribution::Reference` (`src/lib.rs:19`). In `oci-spec@0.9.0` `src/distribution/reference.rs`, `split_domain` gives a name with no dotted host `docker.io` and prefixes `library/` (lines 345-362), and `resolve_registry` maps `docker.io` to `index.docker.io` (lines 177-180). microsandbox sets no mirror registry. So `alpine:3.20` always means `index.docker.io/v2/library/alpine`; a fully qualified host is the only way to choose the registry.

## Decision

1. **Registry: `mirror.gcr.io/library/alpine`.** Google's Docker Hub read-through cache, anonymous, no published pull limit, same digests as Docker Hub. microsandbox's own e2e suite boots `mirror.gcr.io/library/alpine` (`sdk/rust/tests/*.rs`), so the runtime is known to pull from it.
   - Rejected: `public.ecr.aws/docker/library/alpine`. Its unauthenticated quota is 1 pull per second per IP (AWS General Reference, ECR Public quotas); a shared runner IP plus a journey that boots VMs back to back would hit HTTP 429, the same class of failure.
   - Rejected: caching the microsandbox image store in CI. It changes evaluator files (`.github/`), still needs a first pull from somewhere, and leaves the Docker Hub reference in the code.
   - Risk: Google does not guarantee how long an image stays cached. `alpine:3.20` is one of the most pulled images; if the digest ever falls out, the failure names `mirror.gcr.io` and the remedy is a data change in one file.
2. **One source of truth: a private workspace package `@systemfsoftware/microvm-test-images`** at `packages/microvm-test-images` (REPO-S5: consumed by `effect-microsandbox` and the `daemon` family, so it sits at `packages/<name>`). It holds one data file, `images.json`, `{ "alpine": "mirror.gcr.io/library/alpine:3.20@sha256:d9e853e8…" }`, exported as the package root. Both consumers import it with `import images from '@systemfsoftware/microvm-test-images' with { type: 'json' }` (all repo tsconfigs set `resolveJsonModule`; Node runs the smoke example directly and loads JSON modules natively). It is a devDependency of both packages, so pnpm links it and turbo folds its files into each consumer's task hash.
   - Rejected: exporting the constant from `@systemfsoftware/effect-microsandbox`. It would put a test fixture on the published API.
   - Rejected: a relative import across package directories. It bypasses the dependency graph, so turbo would not rerun the daemon tests when the image changes.
   - Rejected: an environment variable set by the workflow. Local runs would need a second default, two sources again.
3. **Call sites.** `examples/boot-alpine.ts` (13 sites, J1-J14) and `effect-daemon-microvm/tests/__fixtures__/child-script.ts` read `images.alpine`. The two fake-runtime tests keep their inert label. README examples keep `alpine:3.20` (the library resolves it).
4. **J15 refusal fixture.** Change to `refusal.invalid/effect-microsandbox-refusal:0.0.0`. `.invalid` is reserved by RFC 2606 and never resolves, so the refusal no longer depends on, or sends anything to, any registry.
5. **Evidence log.** `effect-microsandbox` logs one Info line per sandbox create, `microsandbox sandbox booting` with `sandbox.name` and `sandbox.image`, next to the existing `microsandbox runtime resolved` line. The smoke and the vitest output already print Effect Info logs, so every boot in both jobs names its registry host. Ships with a patch changeset.
6. **Docs.** `effect-daemon-microvm` README "Fixture provenance" points at the shared package and records the mirror probe. The package README states provenance and why the host is not Docker Hub.

## Units

One PR, one commit per unit, all `packages/` (Editable surface; no Evaluator file changes).

- **U1** `packages/microvm-test-images/` (`package.json`, `images.json`, `README.md`, `LICENSE`), devDependency in both consumers, lockfile.
- **U2** `examples/boot-alpine.ts` and `child-script.ts` read `images.alpine`; J15 moves to `refusal.invalid`; daemon README provenance.
- **U3** `SandboxRuntime.ts` boot log line; `.changeset/` patch for `effect-microsandbox`, `none` for any other package whose build hash moves.

## Tests

No new test. Admission gate (test-layer-selection, default refuse):

- The image move: the regression is reproduced by the existing smoke and daemon integration suites, which fail against the bare reference (run 37991399366) and must pass against the mirror. A second test would restate them.
- The boot log line: a test that asserts a log line pins wiring, not behaviour. Refused.
- A guard that forbids bare image names in CI: a new gate (GATE1 needs operator sign-off). Refused; noted in the PR as an option.

## Assumptions checked before work

1. A package with no `build` script still moves its consumers' test hashes when its files change. Verify with `turbo --dry=json`; if false, give the package an inputs-bearing task.
2. Node 24 and both tsconfig module modes (`NodeNext` in `effect-microsandbox`, `preserve` in the daemon) accept `import … from '<pkg>' with { type: 'json' }` where the package root exports a `.json` file. Verify with typecheck and `node --check`-free import probe.
3. microsandbox pulls `host/repo:tag@digest` by digest from that host. Upstream's tests boot `mirror.gcr.io/library/alpine`; CI proves the digest form.

## Verification

- Local: `pnpm install`, `pnpm --filter` typecheck, lint, build, and the non-VM tests of both packages; `pnpm check:local`. No real-microVM suite runs locally (host memory).
- Turbo: `turbo run test --dry=json` before and after editing `images.json` shows the `effect-daemon-microvm#test` hash change.
- CI on the PR head: smoke job and the test job green, run fresh (not cache hits); logs show `sandbox.image: 'mirror.gcr.io/library/alpine:3.20@sha256:d9e853e8…'` for every boot and no `index.docker.io`.
- Honest negative: run 37991399366 attempt 1, jobs 114026241334 and 114026477727, show the old bare reference resolving to `index.docker.io` and failing with the rate-limit and not-authorized errors.

## Review

- ce-doc-review feasibility reviewer: not returned in 30 min; not restarted (conductor ruling).
- The two fake-runtime tests that name `alpine:3.20` cannot reach a pull: both provide `recordingSandboxRuntime` (`tests/__fixtures__/sandbox-runtime.fixture.ts:57-75`), which replaces `MicroVM.SandboxRuntime.acquire` with a ledger write, and that fixture imports `microsandbox` as types only (`:4`). The only code that calls `import('microsandbox')` and `Sandbox.builder(...).create()` is the default runtime's `acquire` (`src/SandboxRuntime.ts:63-78`), which those tests never provide.

## Out of scope

Retries, skips, soft-fails, registry login, patching microsandbox, the inert `alpine` labels in fake-runtime and type tests.
