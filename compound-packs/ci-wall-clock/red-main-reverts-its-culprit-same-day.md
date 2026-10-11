---
title: A red postsubmit verdict names its culprit, files a P0 the same day, and reverts automatically only when attribution is confident
applies_when:
  - adding or changing a postsubmit lane's on-failure handling
  - adding a job that files a P0, comments on a pull request, or opens a revert PR after a red main
  - changing who may merge while main is red
tags: [ci, postsubmit, culprit, revert, p0, merge-freeze]
---

A red main that nobody owns stays red. This repo's Mutation lane failed or was cancelled on 94 consecutive pushes to main from 2026-09-25 to 2026-10-09, and those runs' jobs used 372 job-hours. No job named a culprit or filed anything; the cost was first written down in #700's body ("each failed run costs about 7–9 runner-hours"), and #700 stopped the bleeding by dropping the lane's push trigger.

Reverting on every red is also wrong. SafeRevert's starting point at Google is that "naively integrating FACF directly into a system that immediately reverts all changes it identifies will lead to unhappy developers", because a failure can come from something other than the code: the paper calls these failures "version non-hermetic". So a revert opens automatically only when the evidence isolates one commit.

## Rule

On the day a postsubmit verdict goes red, it names its culprit commit, files a P0 for that commit's author, and merges freeze except the fix; a revert PR opens automatically only when attribution is confident.

- **Culprit:** the first red commit. When main is already red at C1, C2's run starts from the last green commit, covers C1's change too and may also be red, but C2's parent is red, so C2 is not the culprit and gets no revert.
- **Confidence:** a revert PR opens only when all five hold:
  - (a) commit C's own verdict on lane L is red;
  - (b) C's first parent has a completed green verdict on L, read from L's own check runs on that exact commit, so C's run covered C's change alone;
  - (c) the failing jobs, rerun once on C, are red again;
  - (d) the same failing jobs pass when lane L is dispatched at C's first parent with those jobs' test set, at the same time as the rerun on C, so a red caused outside the commit (runner image, network dependency, date, expired credential) never reverts a good commit;
  - (e) `git revert C` applies cleanly to main's tip.
- **P0:** written by the workflow itself, always recording the range the failing run covered (base..head) and the failing jobs, and, when a condition fails, which one. The P0 goes where the repo already holds work, with no settings change:
  - issues enabled: an issue, under an `issues: write` the workflow declares itself;
  - issues disabled: a comment on the culprit commit's merged pull request, under `pull-requests: write` declared only on the red-main job. The comment mentions the author in its own text.
  - Either way, the culprit's subject, author and message appear only inside a fenced block, with `@` neutralized.
  - In this repo the P0 is the comment: `gh api repos/systemfsoftware/systemfsoftware --jq .has_issues` returns `false`, and turning issues on is a settings change.
- **Revert PR:** opened with a user credential, never `GITHUB_TOKEN`, and merged only through the pull-request gate.
- **Freeze:** held at the merge decision. Before each merge, whoever merges reads main's lane verdicts and any open red-main P0, and while one is open merges only its fix. No ruleset, no merge-blocking check, no settings change.

```yaml
# WRONG: systemfsoftware/systemfsoftware e08764fb8f:.github/workflows/mutation.yml:14-15
# The lane can write nothing: no job names a culprit or files a P0. Main's Mutation lane ran
# 94 pushes without a green run (60 failed, 34 cancelled; 2026-09-25 to 2026-10-09) until #700
# dropped the push trigger.
permissions:
  contents: read
---
# RIGHT: neutral shape, no citation. Issues are disabled in this repo, so the P0 is a
# comment on the culprit's merged pull request.
jobs:
  red-main:
    needs: [mutation]
    if: failure() && github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      contents: read
      checks: read
      pull-requests: write # with issues enabled: `issues: write`, and the P0 is an issue
    steps:
# 1. Read lane L's check runs on C and on C's first parent; the culprit is the first red commit.
# 2. Rerun the failing jobs on C, and dispatch L at the parent with their test set, together.
# 3. Write the P0: base..head, failing jobs, each of conditions (a)-(e), an @-mention of the
#    author's login, and the commit's subject, author and message in a fenced block with
#    `@` neutralized.
# 4. Record whether all five conditions held. The patrol opens the revert PR with a user
#    credential only when they did; this job never opens one.
```

Why the revert PR is not opened by the workflow: GitHub, "GITHUB_TOKEN" (https://docs.github.com/en/actions/concepts/security/github_token): "If you need workflow runs from workflow-created pull requests to execute without requiring approval, use a GitHub App installation access token or a personal access token instead of `GITHUB_TOKEN` when creating or updating the pull request." Why `pull-requests: write` suffices for the comment: the same page says "The `GITHUB_TOKEN` secret is a GitHub App installation access token", and the REST reference for "Create an issue comment" (https://docs.github.com/en/rest/issues/comments) says "You can use the REST API to create comments on issues and pull requests. Every pull request is an issue, but not every issue is a pull request", listing GitHub App installation access tokens with "at least one of the following permission sets: "Issues" repository permissions (write) "Pull requests" repository permissions (write)".

What the rule decides, on a real red main: in the public stryker-js-effect on 2026-10-10, #276 and #283 merged 4 seconds apart and #283 renamed a field #276 read. #283's Nix, CI and Release runs went red (38072120188, 38072120209, 38072120373). #276's Nix run (38072116236) was cancelled, so condition (b) fails for #283: no revert PR opens, and the P0 names the range #276..#283 with the failing jobs. The root fix, #295 (`65ecde3cbe`), landed about two hours later with CI green (38080274552).

Grounds: Henderson, Kondareddy, Azad, Nickell, "SafeRevert: When Can Breaking Changes be Automatically Reverted?", ICST 2024 (https://hackthology.com/saferevert-when-can-breaking-changes-be-automatically-reverted.html): "A change is safe to revert if it is a true culprit", with safety stated as "precision must be above 99%"; and "All of these problems behave in _version non-hermetic_ ways, where failures may not be strictly linked to the version of code executed." John Micco, "Flaky Tests at Google and How We Mitigate Them", 2016-05-27 (https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html): "about 84% of the transitions we observe from pass to fail involve a flaky test". For (e), Henderson et al., "Taming the Variants", ICST 2026 (https://hackthology.com/taming-the-variants-multi-architecture-continuous-testing-at-google.html): "a bug-introducing change can be automatically reverted without review, provided there haven't been further changes that would cause merge conflicts".

Gate: `review`. Does the diff's postsubmit lane, on red, fail to name the culprit commit, or fail to write a P0 (an issue under an `issues: write` it declares, or, with issues disabled, a comment on the culprit's merged pull request under a `pull-requests: write` it declares)? Does it open a revert PR without all five confidence conditions, open one with `GITHUB_TOKEN`, or merge one without the pull-request gate? Does the P0 body carry the commit's subject, author or message outside a fenced block with `@` neutralized?
