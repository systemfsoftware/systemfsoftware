---
title: Consume comment-checker's Sandboxed Package - Plan
type: feat
date: 2026-11-26
topic: consume-comment-checker-sandbox
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Consume comment-checker's Sandboxed Package - Plan

## Goal Capsule

- **Objective:** This repository consumes comment-checker's sandboxed package from comment-checker's own flake, and carries no copy of the sandbox in `nix/`.
- **Means:** Delete `nix/comment-checker-sandbox.nix`; take `comment-checker` and `comment-checker-unwrapped` from the flake input, whose nixpkgs is not followed so the binary cache serves the derivation its own CI pushed.
- **Product authority:** owner design ruling: a CLI tool repository owns its own runtime sandbox and ships it as the default; a consumer repository consumes that package and does not re-implement the sandbox.
- **Open blockers:** comment-checker's own pull request must merge and its cache push on `main` must conclude success before this changes the pin.
- **Execution profile:** code. `flake.nix`, `flake.lock`, deletion of one file.
- **Stop conditions:** `.#comment-checker` builds from the input on `x86_64-linux` and `aarch64-linux`; no sandbox copy remains in `nix/`; the dev shell's package is the input's package.
- **Tail ownership:** `ce-work` after this plan is written.

---

## Product Contract

### Summary

The dev shell and the check chain run `comment-checker` as a `PostToolUse` hook. Until now this repository wrapped the raw binary with its own `nix/comment-checker-sandbox.nix` (a Linux-only wrapper). That copy duplicates a sandbox the tool now ships itself, and it drifts: the tool's copy is the one its CI proves and caches. This plan deletes the local copy and consumes the tool's sandboxed package.

### Requirement

The owner's requirement: a consumer repository takes the tool's sandboxed package from the tool's flake, keeps the input unfollowed (no `nixpkgs.follows`) so the binary cache serves the tool's own build, and deletes its local sandbox file. The consumer builds and exports nothing shared.

### Requirements

- R1. `nix/comment-checker-sandbox.nix` is deleted; no file under `nix/` builds a comment-checker sandbox.
- R2. `packages.comment-checker` is `comment-checker.packages.<system>.comment-checker`; `packages.comment-checker-unwrapped` is the input's `comment-checker-unwrapped`.
- R3. The input stays unfollowed.
- R4. The dev shell and the check chain still carry the sandboxed binary.

### Scope Boundaries

**In scope:** `flake.nix`, `flake.lock`, `nix/comment-checker-sandbox.nix`.

**Deferred/Out:** the tool's own flake and CI; any other tool; any shared library.

---

## Planning Contract

### Key Technical Decisions

- **KTD1. Consume, do not re-implement.** The tool's CI runs the conformance check that proves the sandbox; this repository relies on that proof and on the cache, and keeps no second copy that could silently differ.
- **KTD2. Keep the input unfollowed.** Following `nixpkgs` would recompile the tool against this repository's nixpkgs and miss the cached derivation.
- **KTD3. Keep both outputs.** `comment-checker-unwrapped` remains available as a package attribute, taken from the input rather than aliased to the sandboxed one.

### Assumptions

- A1. The tool's sandboxed package runs in this repository's dev shell on the same systems the shell supports.
- A2. The cache serves both outputs for `x86_64-linux` and `aarch64-linux`.

### Measured Answers To The Open Questions

These were measured while preparing the tool change; they justify the choices here.

1. **User namespaces in CI.** Stock Ubuntu runners set `kernel.apparmor_restrict_unprivileged_userns=1`, so an unprivileged `bubblewrap` fails at loopback setup (`bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`); at `0` it works. The tool's conformance job sets it to `0`, so the sandbox this repository consumes is proven on `x86_64-linux` and `aarch64-linux`.
2. **Path character sets.** CI checkouts (`/home/runner/work/<repo>/<repo>`) and 194 worktree directories contain no character outside `[A-Za-z0-9_/.-]`, so the working-directory guard does not refuse a normal checkout.
3. **Environment needs.** `comment-checker` needs no environment variable: it produces the same result under `env -i` as with the inherited environment. The sandboxed package clears the environment and sets none.
4. **Consumers.** The tool's flake is consumed by several repositories across the organisation, public and private; this change modifies none of them.

---

## Implementation Units

### U1. Take the sandboxed package from the input

- **Goal:** The packages attribute exposes the input's sandboxed and raw builds, and the local wrapper is gone.
- **Requirements:** R1, R2, R3, R4
- **Dependencies:** comment-checker's pull request merged and its cache push succeeded
- **Files:** `flake.nix`, `nix/comment-checker-sandbox.nix` (deleted), `flake.lock`
- **Approach:** Replace the `callPackage` of the local wrapper with the input's `comment-checker` output; point `unwrapped` at the input's `comment-checker-unwrapped`; delete the local file; update the lock to the merged revision.
- **Verification:** `nix eval` of both package attributes for `x86_64-linux` and `aarch64-linux`; `nix build .#comment-checker`.

---

## Verification Contract

| # | Command                                                           | Applies | Done signal           |
| - | ----------------------------------------------------------------- | ------- | --------------------- |
| 1 | `nix build --no-link .#comment-checker`                           | U1      | builds from the input |
| 2 | `nix eval --raw .#packages.aarch64-linux.comment-checker.drvPath` | U1      | prints a store path   |
| 3 | `grep -r comment-checker-sandbox nix/`                            | U1      | no match              |

## Definition of Done

- **Global:** R1–R4 hold; no sandbox copy remains; the package and dev shell are the input's sandboxed package.
- **Per-unit:** U1 merged with the lock pinned to the tool's merged revision.
