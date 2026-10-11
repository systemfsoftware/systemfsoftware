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
  - (b) C's first parent has a completed green verdict on L, read from L's own workflow run for that commit's push at its latest attempt (as `release-promotes-the-staging-proven-build` reads it), so C's run covered C's change alone;
  - (c) the failing jobs, rerun once on C, are red again;
  - (d) the same failing jobs pass at C's first parent: lane L is dispatched on main (`workflow_dispatch` with ref `main`) with the parent's SHA and those jobs' test set as inputs, checks out that SHA, and runs at the same time as the rerun on C, so a red caused outside the commit (runner image, network dependency, date, expired credential) never reverts a good commit;
  - (e) `git revert C` applies cleanly to main's tip.
- **P0:** written by the workflow itself before any rerun starts, recording the range the failing run covered (base..head), the failing jobs, the author, (a) and (b), and "revert: no" with (c)-(e) pending; the same P0 is then updated with each condition's result and the revert verdict. A handler stopped by its backstop leaves the P0 standing with "revert: no", which fails closed. The P0 goes where the repo already holds work, with no settings change:
  - issues enabled: an issue, under an `issues: write` the workflow declares itself;
  - issues disabled: a comment on the culprit commit's merged pull request, under `pull-requests: write` declared only on the red-main handler job, and updated in place by its id. The comment mentions the author in its own text: the commit's linked account, or the merged pull request's author when the commit's email links to none.
  - Either way, the culprit's subject, author and message appear only inside a fenced block, with `@` neutralized.
  - In this repo the P0 is the comment: `gh api repos/systemfsoftware/systemfsoftware --jq .has_issues` returns `false`, and turning issues on is a settings change.
- **Handler:** a workflow of its own on `workflow_run` `completed` for lane L, gated on a failed run of attempt 1 triggered by a push to main, so the run it reruns has finished. Its job declares `actions: write` for the rerun, the dispatch and the workflow-run reads, `contents: read` for the checkout and the commit, and the P0 permission. When (b) is false no revert can open, so the handler spends nothing on (c) and (d): it records them as "not run: (b) failed" and still records (e). The rerun it starts (attempt 2), the parent dispatch (event `workflow_dispatch`) and any manual rerun complete without passing the gate, so it never loops and writes one P0 per red push run. Lane L accepts `sha` and `jobs` as `workflow_dispatch` inputs, checks out `inputs.sha` when set, and names the SHA in its `run-name` so the handler can find the dispatched run.
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
# RIGHT: neutral shape, no citation. Issues are disabled in this repo, so the P0 is a comment
# on the pull request that merged C. It is written before any rerun starts and edited in
# place with the results, so a handler stopped by its backstop leaves "revert: no" standing.
name: Red main
on:
  workflow_run:
    workflows: [Mutation]
    types: [completed]
jobs:
  red-main:
    # Attempt 1 only: the rerun this job starts, the parent dispatch and a manual rerun all
    # complete without passing this gate, so the job never loops and writes one P0.
    if: >-
      github.event.workflow_run.conclusion == 'failure' &&
      github.event.workflow_run.event == 'push' &&
      github.event.workflow_run.head_branch == 'main' &&
      github.event.workflow_run.run_attempt == 1
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      contents: read
      actions: write # rerun the failed jobs, dispatch lane L at the parent, read its runs
      pull-requests: write # with issues enabled: `issues: write`, and the P0 is an issue
    env:
      GH_TOKEN: ${{ github.token }}
      GH_REPO: ${{ github.repository }}
      LANE: mutation
      RUN: ${{ github.event.workflow_run.id }}
      SHA: ${{ github.event.workflow_run.head_sha }}
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - name: (a) C is red by the gate; (b) its first parent is the last green commit on lane L
        id: verdicts
        run: |
          # Lane L's verdict on a commit is its workflow run for that commit's push, latest
          # attempt; no completed run reads as not green.
          green() {
            gh api "repos/$GH_REPO/actions/workflows/$LANE.yml/runs?head_sha=$1&event=push" \
              --jq '.workflow_runs[0] | . != null and .status == "completed" and .conclusion == "success"'
          }
          parent="$(git rev-parse "$SHA^")"
          base=""
          for commit in $(git rev-list --first-parent --max-count=200 "$parent"); do
            if [ "$(green "$commit")" = true ]; then base="$commit"; break; fi
          done
          jobs="$(gh run view "$RUN" --json jobs --jq '[.jobs[] | select(.conclusion == "failure") | .name] | join(",")')"
          b=false; [ "$base" = "$parent" ] && b=true
          { echo "parent=$parent"; echo "base=$base"; echo "jobs=$jobs"; echo "b=$b"; } >> "$GITHUB_OUTPUT"
      - name: Write the P0 on the pull request that merged C, before any rerun
        id: p0
        env:
          BASE: ${{ steps.verdicts.outputs.base }}
          JOBS: ${{ steps.verdicts.outputs.jobs }}
          B: ${{ steps.verdicts.outputs.b }}
        run: |
          read -r pr pr_author < <(gh api "repos/$GH_REPO/commits/$SHA/pulls" --jq '.[0] | "\(.number) \(.user.login)"')
          # A commit whose email links to no account has no login; mention the PR's author.
          author="$(gh api "repos/$GH_REPO/commits/$SHA" --jq '.author.login // empty')"
          author="${author:-$pr_author}"
          printf 'P0: lane %s is red on main at %s (run %s).\n\n@%s, this is your commit. Range %s..%s. Failing jobs: %s.\n' \
            "$LANE" "$SHA" "$RUN" "$author" "$BASE" "$SHA" "$JOBS" > "$RUNNER_TEMP/p0-head.md"
          printf '\n~~~text\n%s\n~~~\n' "$(git log -1 --format='%an <%ae>%n%n%B' "$SHA" | sed -e 's/@/(at)/g' -e 's/~/-/g')" \
            > "$RUNNER_TEMP/p0-commit.md"
          if [ "$B" = true ]; then cd_state=pending; else cd_state='not run: (b) failed'; fi
          printf 'Conditions: (a) true, (b) %s, (c) %s, (d) %s, (e) pending. revert: no\n' "$B" "$cd_state" "$cd_state" \
            > "$RUNNER_TEMP/p0-conditions.md"
          id="$(cat "$RUNNER_TEMP/p0-head.md" "$RUNNER_TEMP/p0-conditions.md" "$RUNNER_TEMP/p0-commit.md" \
            | gh api "repos/$GH_REPO/issues/$pr/comments" -F body=@- --jq .id)"
          echo "id=$id" >> "$GITHUB_OUTPUT"
      - name: (c) and (d) rerun the failed jobs on C and dispatch them at the parent, together
        # With (b) false no revert can open, so neither run is spent.
        if: steps.verdicts.outputs.b == 'true'
        id: reruns
        env:
          PARENT: ${{ steps.verdicts.outputs.parent }}
          JOBS: ${{ steps.verdicts.outputs.jobs }}
        run: |
          since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
          gh run rerun "$RUN" --failed
          gh workflow run "$LANE.yml" --ref main -f sha="$PARENT" -f jobs="$JOBS"
          until [ "$(gh run view "$RUN" --json attempt --jq .attempt)" -ge 2 ]; do sleep 10; done
          dispatched=""
          until [ -n "$dispatched" ]; do
            sleep 10
            dispatched="$(gh run list --workflow "$LANE.yml" --event workflow_dispatch --json databaseId,displayTitle,createdAt \
              --jq "map(select(.createdAt >= \"$since\" and (.displayTitle | contains(\"$PARENT\")))) | .[0].databaseId // empty")"
          done
          gh run watch "$RUN" > /dev/null
          gh run watch "$dispatched" > /dev/null
          echo "c=$(gh run view "$RUN" --json conclusion --jq '.conclusion == "failure"')" >> "$GITHUB_OUTPUT"
          echo "d=$(gh run view "$dispatched" --json conclusion --jq '.conclusion == "success"')" >> "$GITHUB_OUTPUT"
      - name: (e) git revert C applies cleanly to main's tip
        id: clean
        run: |
          git fetch origin main
          git checkout --detach origin/main
          if git revert --no-commit "$SHA" > /dev/null 2>&1; then e=true; else e=false; fi
          echo "e=$e" >> "$GITHUB_OUTPUT"
      - name: Update the same P0 with every condition and the revert verdict
        env:
          ID: ${{ steps.p0.outputs.id }}
          B: ${{ steps.verdicts.outputs.b }}
          C: "${{ steps.reruns.outputs.c || 'not run: (b) failed' }}"
          D: "${{ steps.reruns.outputs.d || 'not run: (b) failed' }}"
          E: ${{ steps.clean.outputs.e }}
        run: |
          revert=no; [ "$B$C$D$E" = truetruetruetrue ] && revert=yes
          # The patrol opens the revert PR with a user credential only on "revert: yes";
          # this job never opens one.
          printf 'Conditions: (a) true, (b) %s, (c) %s, (d) %s, (e) %s. revert: %s\n' "$B" "$C" "$D" "$E" "$revert" \
            > "$RUNNER_TEMP/p0-conditions.md"
          cat "$RUNNER_TEMP/p0-head.md" "$RUNNER_TEMP/p0-conditions.md" "$RUNNER_TEMP/p0-commit.md" \
            | gh api --method PATCH "repos/$GH_REPO/issues/comments/$ID" -F body=@- > /dev/null
```

Why the handler is its own workflow, on main, with `actions: write`: GitHub's REST reference for "Create a workflow dispatch event" (https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event) defines `ref` as "The git reference for the workflow. The reference can be a branch or tag name.", so the parent's SHA travels as an input. That endpoint and "Re-run failed jobs from a workflow run" (https://docs.github.com/en/rest/actions/workflow-runs#re-run-failed-jobs-from-a-workflow-run) each state "The fine-grained token must have the following permission set: "Actions" repository permissions (write)". "Re-running workflows and jobs" (https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs) reruns a finished run: "To re-run a failed workflow run, use the run rerun subcommand, replacing RUN_ID with the ID of the failed run that you want to re-run."; no GitHub page describes rerunning a run still in progress, so the handler starts after lane L's run completes. A dispatch made with `GITHUB_TOKEN` still starts the lane, because "workflow_dispatch and repository_dispatch events always create workflow runs" (https://docs.github.com/en/actions/concepts/security/github_token). A rerun's completion can fire the handler again, since only `requested` is skipped on a re-run ("The requested activity type does not occur when a workflow is re-run", "Events that trigger workflows", https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run); the attempt gate makes that a no-op.

Why the revert PR is not opened by the workflow: GitHub, "GITHUB_TOKEN" (https://docs.github.com/en/actions/concepts/security/github_token): "If you need workflow runs from workflow-created pull requests to execute without requiring approval, use a GitHub App installation access token or a personal access token instead of `GITHUB_TOKEN` when creating or updating the pull request." Why `pull-requests: write` suffices for the comment: the same page says "The `GITHUB_TOKEN` secret is a GitHub App installation access token", and the REST reference for "Create an issue comment" (https://docs.github.com/en/rest/issues/comments) says "You can use the REST API to create comments on issues and pull requests. Every pull request is an issue, but not every issue is a pull request", listing GitHub App installation access tokens with "at least one of the following permission sets: "Issues" repository permissions (write) "Pull requests" repository permissions (write)"; "Update an issue comment" (`PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}`, same page) states the same permission sets, so the handler edits its own P0 under the permission that wrote it.

What the rule decides, on a real red main: in the public stryker-js-effect on 2026-10-10, #276 and #283 merged 4 seconds apart and #283 renamed a field #276 read. #283's Nix, CI and Release runs went red (38072120188, 38072120209, 38072120373). #276's Nix run (38072116236) was cancelled, so on the Nix lane condition (b) fails for #283: the handler spends no rerun or dispatch, records (c) and (d) as not run, no revert PR opens, and the P0 names the range #276..#283 with the failing jobs. The root fix, #295 (`65ecde3cbe`), landed about two hours later with CI green (38080274552).

Grounds: Henderson, Kondareddy, Azad, Nickell, "SafeRevert: When Can Breaking Changes be Automatically Reverted?", ICST 2024 (https://hackthology.com/saferevert-when-can-breaking-changes-be-automatically-reverted.html): "A change is safe to revert if it is a true culprit", with safety stated as "precision must be above 99%"; and "All of these problems behave in _version non-hermetic_ ways, where failures may not be strictly linked to the version of code executed." John Micco, "Flaky Tests at Google and How We Mitigate Them", 2016-05-27 (https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html): "about 84% of the transitions we observe from pass to fail involve a flaky test". For (e), Henderson et al., "Taming the Variants", ICST 2026 (https://hackthology.com/taming-the-variants-multi-architecture-continuous-testing-at-google.html): "a bug-introducing change can be automatically reverted without review, provided there haven't been further changes that would cause merge conflicts".

Gate: `review`. Does the diff's handling of a red push run on main fail to name the culprit commit, or fail to write a P0 (an issue under an `issues: write` it declares, or, with issues disabled, a comment on the culprit's merged pull request under a `pull-requests: write` it declares)? Does a job that reruns failed jobs or dispatches lane L leave `actions: write` undeclared? Does it rerun a run that has not completed (a job inside lane L's own run), dispatch the lane with the parent's SHA as its ref instead of on main with the SHA as an input, or act on any attempt but the first? Does it read a lane's verdict from anything but the lane's workflow run for that commit's push? Does it write the P0 only after waiting on reruns, or spend a rerun or a dispatch when (b) is false? Does it open a revert PR without all five confidence conditions, open one with `GITHUB_TOKEN`, or merge one without the pull-request gate? Does the P0 body carry the commit's subject, author or message outside a fenced block with `@` neutralized?
