# ADR: How TypeScript programs nftables for egress enforcement

Status: proposed (REPO-W8 research complete)
Date: 2026-08-11
Scope: `npm/apps/terok` — the from-scratch TypeScript/Effect-TS reimplementation
of `terok`. Target box: Linux, podman 6.0.2 **rootless** with netavark,
nftables v1.1.6 (`/usr/bin/nft`).

## Decision

Program nftables by shelling out to the `nft` binary, using its JSON
interface:

- **Apply a ruleset**: spawn `nft -j -f -` and write the JSON ruleset to
  stdin. JSON input on `nft` 1.1.6 is verified working on the target box
  (see Sources read); the schema is documented on-box in
  `libnftables-json(5)`.
- **Verify / read state**: spawn `nft -j list table inet terok_shield` and
  parse the JSON output against invariants (policy drop, tier sets present,
  terminal deny-all, hard-deny ranges), replacing terok-shield's regex-over-
  text verification with structural JSON checks.
- **Runtime set ops** (per-container allow/deny/override): spawn
  `podman unshare nsenter -t <pid> -n nft -j -f -` with a JSON batch of
  add/delete element commands, mirroring terok-shield's
  `nft_via_nsenter` (`run.py`). `<pid>` = `podman inspect --format
  '{{.State.Pid}}'`.
- **Start-time application**: pre-generate the ruleset at `pre_start`, and
  apply it from a **standalone, dependency-free OCI hook** at
  `createRuntime`, entering the container netns with `nsenter -n` and piping
  the ruleset via stdin — exactly terok-shield's hook design. The hook must
  remain stdlib-only and statically installed: it runs outside any Node
  runtime or package manager.

No npm dependency is added for the control plane. An Effect-TS `Command`
adapter (one `.adapter.ts` wrapping `spawn`) is the only boundary.

## Candidates considered

1. **`nft` binary subprocess with JSON (`nft -j -f -`)** — **CHOSEN**.
   Same subprocess mechanism as the reference implementation, wire format
   matching podman's own network backend (see below). JSON over plain nft
   syntax because: (a) host names/IPs are escaped by `JSON.stringify`
   instead of interpolated into nft grammar (removes the injection class
   terok-shield defends with `_SAFE_IDENT_RE` / `_safe_*` validators);
   (b) `list` output is structurally parseable instead of regex-matched;
   (c) netavark precedent (below).

2. **`nft` binary subprocess with plain nft syntax** (`nft -f -` with a
   `ruleset.nft` text file) — **runner-up**. This is terok-shield's own wire
   format (`resources/nft_hook.py` pipes `ruleset.nft` text). Lost as the
   primary choice only on the wire format, not the mechanism: text
   interpolation is the one injection surface the Python code actively
   defends, JSON removes it, and the JSON schema is versioned with nftables.
   Kept as the fallback if the JSON schema proves unstable (see reversal
   clause).

3. **`nftables-napi` (kastov/nftables-napi, v0.5.0, npm)** — native netlink
   binding via libnftnl+libmnl, prebuilt linux-x64/arm64, actively pushed
   (2026-06-24). **Lost** on five grounds:
   - License **AGPL-3.0-only** — a copyleft constraint on a product shipping
     a CLI/TUI.
   - API is a _fixed table shape_ (ingress/egress addr sets + egress port
     sets). It cannot express terok's tiered per-container policy: t10
     override above the deny, t20/t30/t40 allow sets, per-element timeouts,
     hard-deny/private range rejects, NFLOG prefixes, quarantine chains, or
     dnsmasq `--nftset` auto-population.
   - In-process netlink means the **process itself** must hold CAP_NET_ADMIN
     in the target netns. The start-time OCI hook cannot run Node at all,
     and runtime ops would mean `podman unshare nsenter -n node …` — a
     subprocess that is heavier, not lighter, than spawning `nft`.
   - `createTable()` "deletes existing tables first" — destructive to
     netavark's own `netavark` table and to other containers' state in the
     shared host netns.
   - `engines: node >= 24` pins the runtime.

4. **`node-libnftables` (dkxl/node-libnftables, v1.0.0, npm)** — native
   bindings to libnftables (the C library the `nft` binary itself embeds).
   **Lost**: dormant since 2024-10-26 (last commit = the publish); no
   prebuilds — cmake-js compile against `libnftables-dev` on every install;
   same CAP_NET_ADMIN-in-process problem and same OCI-hook impossibility as
   #3. Its one advantage (in-process, no fork) is irrelevant at terok's event
   rate (once per container start, plus occasional allow/deny).

5. **`@push.rocks/smartnftables` (v1.2.1, npm)** — pure-TS rulebuilder that
   shells out to `nft <command>`. **Lost**: it hard-requires host euid 0
   (`NftNotRootError` on `process.getuid() !== 0`), which breaks the
   rootless model where the host process is an unprivileged user; its API is
   a host-level NAT/firewall/ratelimit rulebuilder, not a per-container-netns
   tier engine; its abstractions would fight terok's own tier model.

6. **Delegate to Podman/netavark** — **Lost**. Netavark's firewall driver
   (`src/firewall/nft.rs`) only programs podman's _own_ port-forwards,
   masquerade, and isolation in the **host** netns. Under rootless networking
   (pasta/slirp4netns) container egress is visible only **inside the
   container's network namespace**, which podman's firewall driver never
   touches; and no podman API expresses an ordered allow/deny tier policy.
   The firewalld D-Bus alternative requires the firewalld daemon and
   host-level zones — wrong scope, extra daemon, not the box's setup.

7. **Hand-rolled nf_tables netlink from TypeScript** — **Lost**. No
   maintained npm binding exists (the original `nftables` package was
   unpublished on 2021-03-23; registry search for nftables/netfilter/
   nfnetlink yields only #3 and #4). Writing raw nf_tables netlink from
   scratch re-implements nft + libnftnl plus all kernel-protocol churn, and
   still cannot run from the OCI hook.

## What comparable projects actually ship

**terok itself (the Python reference, `/tmp/terok` + `terok-shield` v0.8.0a8
wheel)** — the egress firewall is the `nft` binary over subprocess, applied
**inside the container netns**:

- `pyproject.toml` pins `terok-shield @
  https://github.com/terok-ai/terok-shield/releases/download/v0.8.0a8/…`;
  `terok.lib` is a thin delegating adapter (`sandbox.py` re-exports
  `ShieldManager`).
- `terok_shield/hooks/mode.py`: "Uses OCI hooks to apply per-container
  nftables rules inside each container's network namespace. **No root
  required — only podman and nft.**"
- `terok_shield/run.py`: `SubprocessRunner.nft_via_nsenter()` builds
  `["podman", "unshare", "nsenter", "-t", pid, "-n", nft, …]`; `nft()` adds
  `-f -` with `stdin=`. No JSON anywhere in the control plane — verification
  is regex over `nft list table inet terok_shield` text (`nft/rules.py`
  `verify_hook`).
- `terok_shield/resources/nft_hook.py`: the OCI hook (createRuntime stage)
  pipes the pre-generated ruleset via `nsenter(pid, nft, "-f", "-",
  stdin=ruleset.read_text())`, with a documented SELinux workaround for
  stdin piping; `resources/_oci_state.py` is stdlib-only because "hook
  scripts run outside the package venv".

**netavark (podman's network backend — the one this box runs)** —
programs nftables the same way, with JSON:

- `src/firewall/nft.rs` builds the ruleset as typed schema objects
  (`use nftables::batch::Batch; …`) and calls
  `helper::apply_ruleset(&rules)`.
- `nftables` crate v0.6.3 (`Cargo.lock`), `src/helper.rs`:
  `apply_ruleset_raw` spawns `nft -j -f -` and writes JSON to stdin
  (`default_args = ["-j", "-f", "-"]`); `get_current_ruleset` runs
  `nft -j list ruleset` and parses JSON. Error text "got invalid json" /
  "unable to execute".
- Driver selection is firewalld / nftables / none (`src/firewall/mod.rs`).

**Verified on the target box**: `nft` v1.1.6 accepts JSON input — feeding
`{"nftables":[{"add":{"table":{}}}]}` returns the JSON-domain error
`Error: Object item not found: family`, and a well-formed table command
reaches the kernel (EPERM as non-root). `man libnftables-json` (man 5) is
installed and documents the schema. `podman info` reports
`NetworkBackend: netavark`, `Rootless: true`.

**Node ecosystem**: npm registry search for `nftables`/`netfilter`/
`nfnetlink` returns exactly two maintained wrappers — `nftables-napi`
(0.5.0, 2026-06-24) and `node-libnftables` (1.0.0, 2024-10-26) — both native
CAP_NET_ADMIN-in-process bindings, both ineligible per the deciding
criterion. Nothing maintained wraps the `nft` CLI for TS. Conclusion:
**no maintained implementation exists for this mechanism; the shell-out
layer is small and hand-rolled by necessity** (the reference implementation
hand-rolled the identical layer in Python).

## Deciding criterion

**The mechanism must work rootless against per-container network
namespaces on the target box (podman 6.0.2 rootless, netavark).** That
forces two execution contexts nothing in-process can satisfy:

- **Start-time**: a standalone OCI hook script running with CAP_NET_ADMIN
  inside the container netns at `createRuntime` — no Node runtime, no npm
  deps, no native addons can exist there. Only the `nft` binary fits.
- **Runtime**: host-side `podman unshare nsenter -n` wrappers into the
  container netns (rootless podman grants CAP_NET_ADMIN there). The `nft`
  binary is a natural fit; a netlink/libnftables binding merely moves the
  subprocess boundary to a heavier Node process.

Secondary criterion: match what the reference implementation and podman's
own backend ship (subprocess + `nft`), and express terok's full tier model —
which rules out every existing npm wrapper's API surface.

## What would reverse this

- **A maintained npm binding that documents and supports the rootless
  per-netns model** — e.g. ships a standalone hook helper, or is
  demonstrated under `podman unshare nsenter -n` — would replace the
  hand-rolled adapter (still inside the OCI hook; the hook itself stays
  stdlib-only either way).
- **Podman/netavark exposing a stable per-container egress-ACL API**
  (network firewall options, or a firewalld D-Bus policy surface) that can
  express the tier model — t10 override _above_ the deny, per-container
  allow sets, dnsmasq nftset population, per-element timeouts — would make
  delegation cheaper than a hand-rolled nft layer. Today no such API
  exists.
- **Partial reversal (mechanism unchanged, wire format flips)**: if the
  nft JSON schema proves unstable across nftables versions terok must
  support, fall back to terok-shield's plain-text `ruleset.nft` format over
  the same `nft -f -` subprocess — the injection-surface trade is then
  defended by the same input validators the Python code uses.

## Sources read

- `github.com/terok-ai/terok-shield` (clone, v0.8.0a8-era master):
  - `src/terok_shield/hooks/mode.py` — rootless OCI-hook mechanism;
    "No root required — only podman and nft".
  - `src/terok_shield/run.py` — `nft_via_nsenter()` (podman unshare +
    nsenter -n) and `nft()` (`-f -` stdin); `find_nft()`.
  - `src/terok_shield/resources/nft_hook.py` — hook applies ruleset via
    `nsenter(pid, nft, "-f", "-", stdin=…)` at createRuntime.
  - `src/terok_shield/resources/_oci_state.py` — stdlib-only ballast
    (hooks run outside the package venv).
  - `src/terok_shield/nft/rules.py` — tier ruleset generation, input
    validation (`_SAFE_IDENT_RE`), verification by regex over
    `nft list table` text.
  - `src/terok_shield/nft/constants.py` — table/chain/set names.
- `/tmp/terok/pyproject.toml` — terok-shield 0.8.0a8 wheel URL.
- `github.com/containers/netavark` (clone):
  - `src/firewall/nft.rs` — typed nftables schema, `helper::apply_ruleset`.
  - `src/firewall/mod.rs` — driver registry (firewalld/nftables/none).
  - `Cargo.lock` — `nftables` crate v0.6.3.
- `github.com/nftables-rs/nftables-rs` (crate source, v0.6.3 `src/helper.rs`,
  via crates.io metadata + raw file): `apply_ruleset_raw` spawns
  `nft -j -f -`, JSON on stdin; `get_current_ruleset` = `nft -j list
  ruleset`.
- Target box, live: `nft --version` (v1.1.6), `nft --help` (`-j, --json`),
  JSON-input probes (`Object item not found: family`; EPERM on valid
  table), `man -w libnftables-json`, `podman info` (netavark, rootless
  true), `ls /usr/lib/libnftables.so.1.1.0`.
- npm registry (live queries 2026-08-11): `nftables` (unpublished
  2021-03-23), `nftables-napi` 0.5.0 (repo kastov/nftables-napi),
  `node-libnftables` 1.0.0 (dkxl/node-libnftables),
  `@push.rocks/smartnftables` 1.2.1; `-/v1/search` for
  nftables/netfilter/nfnetlink.
- `github.com/kastov/nftables-napi` README — AGPL-3.0-only, Node ≥ 24,
  fixed-table API, CAP_NET_ADMIN/root, prebuilds.
- `github.com/dkxl/node-libnftables` README — libnftables bindings,
  CAP_NET_ADMIN, compile-from-source, OUTPUT_JSON.
- `github.com/push.rocks/smartnftables` `ts/nft.executor.ts` —
  `execFile('nft', [cmd])`, `NftNotRootError` (euid 0).
