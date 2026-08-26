---
title: A settings-file catalog cannot dispatch plugin-bundled hooks
date: 2026-08-26
category: integration-issues
module: omp-claude-compat
problem_type: integration_issue
component: tooling
severity: high
symptoms:
  - "An enabled Claude Code plugin's command hook never runs"
  - "A Write that the plugin should block succeeds unless the hook is copied into project settings"
  - "A plugin command that interpolates the plugin root cannot resolve that path"
root_cause: missing_workflow_step
resolution_type: code_fix
related_components:
  - assistant
tags:
  - hook-bridge
  - plugin-hook-file
  - claude-plugin-root
---

# A settings-file catalog cannot dispatch plugin-bundled hooks

## Problem

The hook bridge treated settings files as the only hook source. Claude Code also runs command hooks from an enabled plugin's plugin hook file, with the child environment naming that plugin's root. Installing the plugin therefore did not install the hook.

## Failure mode

Let $S$ be the settings-file catalog and $P$ the set of enabled plugin roots that contain both a Claude plugin manifest and a plugin hook file. The effective hook set must be $S \cup P$. A loader that implements only $S$ yields $P = \emptyset$ for every event, so matcher, exit-code, and environment contracts on $P$ are never evaluated.

Copying a plugin hook into a settings file is not $P$. It is another element of $S$. It also cannot set the plugin-root environment, because a settings hook has no plugin root.

The host's enablement record (marketplace registry plus npm/link lockfile, including the XDG data-home plugins directory) is the membership test for $P$. Hard-coding only `~/.omp/plugins` misses the XDG tree the host actually lists.

## Invariant

Every enabled plugin root is a non-managed settings source. Merge concatenates; it does not replace. The hook child for a stamped command observes the plugin-root environment equal to that root. A manifest without a hook file contributes nothing. An unreadable hook file contributes nothing and is reported the same way as an unreadable settings file.

Discovery is a fold over known registry and lockfile reads, not an imperative I/O loop that mutates an accumulator inside the effect.

## Prevention

A gatekeeper fixture with no project settings file must fail if $P$ is not loaded. A second scenario must assert the plugin-root environment on the child. A third must record both a settings hook and a plugin hook when both match.

Related: `docs/solutions/integration-issues/comment-checker-hook-silently-bypasses-on-patch-mode-edit.md` — payload translation, not source catalog.
