---
title: A root doctrine symlink dangles after the vendored constitution drops the file it points to
date: 2026-11-13
category: tooling
problem_type: broken_reference
severity: low
symptoms:
  - CONSTITUTION-ARTICLES.md at the repository root is a symlink to repos/constitution/CONSTITUTION-ARTICLES.md, which does not exist
  - Repositories that vendor this one get a dangling symlink inside repos/worktrunk-scripts
tags:
  - subtree
  - symlink
  - constitution
---

# A root doctrine symlink dangles after the vendored constitution drops the file it points to

## Problem

The constitution removed `CONSTITUTION-ARTICLES.md` (systemfsoftware/constitution 26a527c0, "restore the single resident document"). This repository still carried a root symlink to `repos/constitution/CONSTITUTION-ARTICLES.md`, and AGENTS.md still routed to it. Once the subtree update landed, the link pointed at nothing. It also dangled inside every repository that vendors worktrunk-scripts, where the subtree import has to replace it with an empty file.

## Fix

Delete the symlink and its AGENTS.md routing row. `CONSTITUTION.md` is the only root doctrine file.

## Prevention

When a subtree update removes a file, look for root symlinks and AGENTS.md rows that name it, and change them in the same update.
