---
problem_type: build_error
---

# Cold CI Jobs Download the Vendored Subtrees Through the Repository Archive

## Symptom

SYS-1411: a PR check spent 70-90% of its job time on setup. In effect-microvm's commitlint job (run 43364358441,
job 131685134087) the `nix develop` step took 134 s of a 170 s job. Nine `unpacking 'github:...'` lines ran one after
another from 04:17:12 to 04:18:41, about 90 s, and one gap alone was 21 s. In frontend's check job (run 43365099616,
job 131687535703) the same unpacking took about 100 s of a 286 s step.

## Cause

A `github:` flake input is fetched as the repository's GitHub archive. The archive of this repository was 109 MB
compressed because `repos/` holds the vendored upstream subtrees: 272 MB of 38,917 files, which no flake, workflow or
action reads. A consumer pins this repository, and the nested `pnpm-release-management` inputs, at several revisions
(this repository at 3ef6c21 and at 31963d5, `pnpm-release-management` at three), so a cold runner downloaded and
unpacked each archive in turn. `pnpm-release-management` carries a 192 MB `repos/` of its own. Every `uses:
systemfsoftware/systemfsoftware/.github/actions/...` also downloads this archive (`Getting action download info`, 8 s
in the same job).

## Fix

`/repos/ export-ignore` in `.gitattributes`: GitHub's archive, `git archive` and the Nix `github:` fetcher all honour
it, and a checkout still holds the subtrees.
