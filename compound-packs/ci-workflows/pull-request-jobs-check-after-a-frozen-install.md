---
title: A pull-request job runs lint and typecheck in one job after only checkout, a pinned tool fetch, a cache restore and a frozen install
applies_when:
  - adding or changing a pull-request job's steps or needs:
  - adding a commit-message, changeset or PR-title check
tags: [ci, setup, dev-shell, pinning]
---

Before its verdict step a pull-request job runs only checkout, one pinned tool fetch, a cache restore and a frozen install; it never enters a dev shell (nix develop or a dev-shell action), builds a tool from source, bootstraps the workspace or waits on a producer job through needs:.
Code lint and typecheck run in one job with one checkout and one install, never one job or matrix leg per gate.
Commit-message checks run as a step in the lint-and-typecheck job; changeset and PR-title checks run their pinned tool in their own job with no workspace install, dev shell or needs:.
Every tool version and every action ref is pinned exactly (a full version or a commit SHA), never @latest, a bare major such as @v6, or an unset setup-action version input.

Gate: judge
