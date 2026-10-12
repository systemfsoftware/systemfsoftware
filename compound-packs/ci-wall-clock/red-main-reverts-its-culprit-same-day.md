---
title: A red postsubmit verdict files a P0 the same day, names its culprit when the parent is green, and reverts automatically only when attribution is confident
applies_when:
  - adding or changing a postsubmit lane's on-failure handling, or a `workflow_run` handler that reacts to a red run
  - adding a job that files a P0, comments on a pull request, or opens a revert PR after a red main
  - changing who may merge while main is red
tags: [ci, workflows, postsubmit, culprit, revert, p0, merge-freeze]
---

A red main that nobody owns stays red. This repo's Mutation lane failed or was cancelled on 94 consecutive pushes to main from 2026-09-25 to 2026-10-09, and those runs' jobs used 372 job-hours. No job named a culprit or filed anything; the cost was first written down in #700's body ("each failed run costs about 7–9 runner-hours"), and #700 stopped the bleeding by dropping the lane's push trigger.

Reverting on every red is also wrong. SafeRevert's starting point at Google is that "naively integrating FACF directly into a system that immediately reverts all changes it identifies will lead to unhappy developers", because a failure can come from something other than the code: the paper calls these failures "version non-hermetic". So a revert opens automatically only when the evidence isolates one commit.

## Rule

On the day a postsubmit verdict goes red, it files a P0 for the red commit's author, naming that commit the culprit when its first parent is green, and merges freeze except the fix; a revert PR opens automatically only when attribution is confident.

- **Culprit:** the first red commit. When main is already red at C1, C2's run starts from the last green commit, covers C1's change too and may also be red, but C2's parent is red, so C2 is not the culprit and gets no revert.
- **Confidence:** a revert PR opens only when all five hold:
  - (a) commit C's own verdict on lane L is red;
  - (b) C's first parent has a completed green verdict on L, read from L's own workflow run for that commit's push at its latest attempt (as `release-promotes-the-staging-proven-build` reads it), so C's run covered C's change alone;
  - (c) the failing jobs, rerun once on C, are red again;
  - (d) the same failing jobs pass at C's first parent: lane L is dispatched on main (`workflow_dispatch` with ref `main`) with the parent's SHA and those jobs' test set as inputs, checks out that SHA, and runs at the same time as the rerun on C, so a red caused outside the commit (runner image, network dependency, date, expired credential) never reverts a good commit;
  - (e) `git revert C` applies cleanly to main's tip.
- **P0:** written by the workflow itself before any rerun starts, for every push run of lane L on main that ends `failure`, `cancelled`, `timed_out` or `startup_failure`, recording how the run ended, the range it covered (base..head), the jobs that did not pass, the author, (a) and (b), and "revert: no" with (c)-(e) pending. A run that ended other than `failure` has no red verdict: (a) records how it ended and nothing reruns, but the P0 and the freeze hold until a green run replaces it. The same P0 is updated by a step that runs on every path (`if: always()`), so a rerun or dispatch that failed to start is recorded with its step's outcome, never as not run, and once more by the verdict workflow when both runs it started have completed. Only literal `true` results for (a)-(e) make "revert: yes"; a missing, failed, pending or not-run condition leaves "revert: no". A handler or verdict job stopped by its backstop leaves the P0 standing with "revert: no", which fails closed. The P0 goes where the repo already holds work, with no settings change:
  - issues enabled: an issue, under an `issues: write` the workflow declares itself;
  - issues disabled: a comment on the culprit commit's merged pull request, under `pull-requests: write` declared only on the red-main handler and verdict jobs, and updated in place by its id. The comment mentions the author in its own text: the commit's linked account, or the merged pull request's author when the commit's email links to none.
  - no merged pull request carries the commit (a bot or direct push to main), the pull-request lookup fails, or the comment cannot be written: the P0 is the handler run's step summary, and the handler job ends red on it. Nothing reruns and no comment exists for the patrol to read, so the revert stays "no".
  - The P0 names the commit's author as its owner. It calls the commit the culprit only when (b) holds; when C's first parent is not green, it says C is not named the culprit.
  - In every case, the commit's subject, author and message appear only inside a fenced block, with `@` neutralized.
  - In this repo the P0 is the comment: `gh api repos/systemfsoftware/systemfsoftware --jq .has_issues` returns `false`, and turning issues on is a settings change.
- **Handler:** a workflow of its own on `workflow_run` `completed` for lane L, gated on a not-succeeded run of attempt 1 triggered by a push to main, so the run it reruns has finished. Its job declares `actions: write` for the rerun, the dispatch and the workflow-run reads, `contents: read` for the checkout and the commit, and the P0 permission. When (b) is not true no revert can open, so the handler spends nothing on (c) and (d): it records them as "not run: (b) not true" and still records (e). The rerun it starts (attempt 2), the parent dispatch (event `workflow_dispatch`) and any manual rerun complete without passing the gate, so it never loops and writes one P0 per not-succeeded push run. It starts the rerun and the dispatch and waits on neither, so its own backstop never races a lane run's length; the P0 it leaves carries a marker naming C, the rerun's run id and the dispatched run's id. Every `gh` call it makes is checked. A failed lookup before the P0 is written degrades the P0 and never prevents it: (b) or the failing jobs read "unknown", or the P0 takes its summary form. Each lookup after it is an attempt loop with a fixed count that fails the step with an error when it runs out; no failed call or missing run is waited on until the backstop, and no wall-clock kill shorter than the backstop is added.
- **Verdict:** a second workflow on `workflow_run` `completed` for lane L, gated on a rerun (a push run's attempt 2 or later) or a dispatch on main. It finds the P0 by the marker naming the run that completed, and does nothing when that run's pair is still running, so whichever of the two completes last records (c), (d) and (e) and sets "revert: yes" only on three more literal `true` results. A run no P0 names (a manual rerun or dispatch) ends the job with a line in its summary. It declares `actions: read`, `contents: read` and the P0 permission, and never opens the revert PR.
- **Lane L's dispatch contract:** lane L accepts `sha` and `jobs` as `workflow_dispatch` inputs, checks out `inputs.sha` when set, and sets `run-name: <workflow name> ${{ inputs.sha || github.sha }}`, so every run's title names the commit it tests. The handler finds the run it dispatched by that exact title, the `workflow_dispatch` event, the `main` branch and a creation time after its dispatch.
- **Revert PR:** opened with a user credential, never `GITHUB_TOKEN`, and merged only through the pull-request gate.
- **Freeze:** held at the merge decision. Before each merge, whoever merges reads main's lane verdicts and any open red-main P0 (a P0 comment, or a red handler run whose summary holds the P0), and while one is open merges only its fix. No ruleset, no merge-blocking check, no settings change.

```yaml
# WRONG: systemfsoftware/systemfsoftware e08764fb8f:.github/workflows/mutation.yml:14-15
# The lane can write nothing: no job names a culprit or files a P0. Main's Mutation lane ran
# 94 pushes without a green run (60 failed, 34 cancelled; 2026-09-25 to 2026-10-09) until #700
# dropped the push trigger.
permissions:
  contents: read
---
# RIGHT: neutral shape, no citation. Lane L's dispatch contract: every run's title is
# "Mutation <sha>", the commit it tests, so the handler below finds the run it dispatched.
# Cost: about 107 runner-min/day for the run every push to main starts, an in-diff run
# scoped from the lane's last green commit: 10 job-min per run, measured on the public
# gritlint's in-diff mutation run 38112987198 until this lane records its own, at 10.7
# pushes/day (75 first-parent commits on main, 2026-10-04T06:00Z to 2026-10-11T06:00Z).
# The full corpus is the fallback's cost, not the daily price
# (`heavy-lanes-state-their-daily-minutes`).
name: Mutation
run-name: Mutation ${{ inputs.sha || github.sha }}
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      sha:
        description: The commit to test. Empty means the head of the dispatched ref.
        type: string
        required: false
      jobs:
        description: Comma-separated names of the jobs to run. Empty means every job.
        type: string
        required: false
permissions:
  contents: read
jobs:
  plan:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - id: start
        run: echo "at=$(date +%s)" >> "$GITHUB_OUTPUT"
      - uses: actions/checkout@v7
        with:
          ref: ${{ inputs.sha || github.sha }}
          persist-credentials: false
      # ... the lane's own steps: only the jobs in inputs.jobs when it is set ...
      - if: always()
        env:
          STARTED: ${{ steps.start.outputs.at }}
        run: |
          echo "wall time: $(( $(date +%s) - STARTED )) s" >> "$GITHUB_STEP_SUMMARY"
---
# RIGHT: neutral shape, no citation. Issues are disabled in this repo, so the P0 is a comment
# on the pull request that merged C. It is written before any rerun starts and edited in
# place on every path, so a failed rerun, a failed lookup or a handler stopped by its
# backstop leaves "revert: no" standing. The handler starts the rerun and the parent
# dispatch and waits on neither; the verdict workflow after it records their results.
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
      contains(fromJSON('["failure", "cancelled", "timed_out", "startup_failure"]'), github.event.workflow_run.conclusion) &&
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
      NAME: Mutation # lane L's workflow name, the first word of its run-name
      RUN: ${{ github.event.workflow_run.id }}
      CONCLUSION: ${{ github.event.workflow_run.conclusion }}
      SHA: ${{ github.event.workflow_run.head_sha }}
    steps:
      - id: start
        run: echo "at=$(date +%s)" >> "$GITHUB_OUTPUT"
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - name: (a) C's run is red; (b) its first parent is the last green commit on lane L
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
          b=false
          a=true
          # A cancelled, timed-out or startup-failed run is not a red verdict: the P0 still goes
          # out, (a) records how the run ended, and nothing reruns.
          if [ "$CONCLUSION" != failure ]; then a="not red: the run ended $CONCLUSION"; b="not run: (a) not true"; fi
          if [ "$a" = true ]; then
            # A failed lookup leaves (b) unknown instead of failing this step, so the P0 below
            # is still written; only a literal "true" opens a revert.
            for commit in $(git rev-list --first-parent --max-count=200 "$parent"); do
              if ! g="$(green "$commit")"; then b="unknown: could not read lane $LANE's runs for $commit"; break; fi
              if [ "$g" = true ]; then base="$commit"; break; fi
            done
          fi
          jobs="$(gh run view "$RUN" --json jobs \
            --jq '[.jobs[] | select(.conclusion != null and .conclusion != "success" and .conclusion != "skipped") | .name] | join(",")')" \
            || jobs="unknown: could not read the jobs of run $RUN"
          [ "$b" = false ] && [ "$base" = "$parent" ] && b=true
          { echo "parent=$parent"; echo "base=${base:-unknown}"; echo "jobs=$jobs"; echo "a=$a"; echo "b=$b"; } >> "$GITHUB_OUTPUT"
      - name: Write the P0 on the pull request that merged C, before any rerun
        id: p0
        env:
          BASE: ${{ steps.verdicts.outputs.base }}
          JOBS: ${{ steps.verdicts.outputs.jobs }}
          A: ${{ steps.verdicts.outputs.a }}
          B: ${{ steps.verdicts.outputs.b }}
        run: |
          fail() { echo "::error::$1"; exit 1; }
          # A failed lookup degrades the P0, never removes it: no pull request found means the
          # summary form below, and an unknown author means the commit block names the owner.
          pulls="$(gh api "repos/$GH_REPO/commits/$SHA/pulls" \
            --jq 'first(.[] | select(.merged_at != null) | "\(.number) \(.user.login)") // empty')" \
            || pulls=""
          read -r pr pr_author <<< "$pulls"
          # A commit whose email links to no account has no login; mention the PR's author.
          author="$(gh api "repos/$GH_REPO/commits/$SHA" --jq '.author.login // empty')" || author=""
          author="${author:-$pr_author}"
          owner="${author:+@$author}"; owner="${owner:-the author in the block below}"
          # Only a green first parent makes C the culprit; otherwise the range was already red
          # or unjudged before C, and the P0 names C's author as owner, not as culprit.
          if [ "$B" = true ]; then who="$owner, this is your commit."
          else who="$owner owns this run; $SHA is not named the culprit, because its first parent is not green on lane $LANE."; fi
          printf 'P0: lane %s ended %s on main at %s (run %s).\n\n%s Range %s..%s. Jobs that did not pass: %s.\n' \
            "$LANE" "$CONCLUSION" "$SHA" "$RUN" "$who" "$BASE" "$SHA" "$JOBS" > "$RUNNER_TEMP/p0-head.md"
          printf '\n~~~text\n%s\n~~~\n' "$(git log -1 --format='%an <%ae>%n%n%B' "$SHA" | sed -e 's/@/(at)/g' -e 's/~/-/g')" \
            > "$RUNNER_TEMP/p0-commit.md"
          if [ "$B" = true ]; then cd_state=pending; else cd_state='not run: (b) not true'; fi
          printf 'Conditions: (a) %s, (b) %s, (c) %s, (d) %s, (e) pending. revert: no\n' "$A" "$B" "$cd_state" "$cd_state" \
            > "$RUNNER_TEMP/p0-conditions.md"
          : > "$RUNNER_TEMP/p0-mark.md"
          # With no pull request to comment on (a bot or direct push, or a failed lookup), or a
          # comment that could not be written, the P0 is this run's summary and this job's red
          # result. Nothing reruns, so the revert stays no.
          summary() {
            cat "$RUNNER_TEMP/p0-head.md" "$RUNNER_TEMP/p0-conditions.md" "$RUNNER_TEMP/p0-commit.md" \
              >> "$GITHUB_STEP_SUMMARY"
            fail "$1: the P0 is this run's summary"
          }
          [ -n "$pr" ] || summary "no merged pull request carries $SHA"
          id="$(cat "$RUNNER_TEMP/p0-head.md" "$RUNNER_TEMP/p0-conditions.md" "$RUNNER_TEMP/p0-commit.md" \
            | gh api "repos/$GH_REPO/issues/$pr/comments" -F body=@- --jq .id)" || summary "could not write the P0 on #$pr"
          echo "id=$id" >> "$GITHUB_OUTPUT"
      - name: (c) and (d) start the rerun of the failed jobs on C and the dispatch at the parent
        # With (b) not true no revert can open, so neither run is spent. Every gh call is checked
        # and each lookup is a 60-attempt loop that fails this step when it runs out; the P0
        # update below records the failure. No step waits on either run: their completions
        # start the verdict workflow.
        if: steps.verdicts.outputs.b == 'true'
        id: reruns
        env:
          PARENT: ${{ steps.verdicts.outputs.parent }}
          JOBS: ${{ steps.verdicts.outputs.jobs }}
        run: |
          fail() { echo "::error::$1"; exit 1; }
          since="$(date -u -d '1 minute ago' +%Y-%m-%dT%H:%M:%SZ)"
          gh run rerun "$RUN" --failed || fail "could not rerun the failed jobs of run $RUN"
          gh workflow run "$LANE.yml" --ref main -f sha="$PARENT" -f jobs="$JOBS" \
            || fail "could not dispatch $LANE.yml on main at $PARENT"
          # Lane L's run-name is "$NAME <sha>", so the dispatched run is found by its title.
          attempt=0
          dispatched=""
          for _ in $(seq 60); do
            attempt="$(gh run view "$RUN" --json attempt --jq .attempt)" || fail "could not read run $RUN"
            dispatched="$(gh run list --workflow "$LANE.yml" --event workflow_dispatch --branch main \
              --json databaseId,displayTitle,createdAt \
              --jq "map(select(.displayTitle == \"$NAME $PARENT\" and .createdAt >= \"$since\")) | .[0].databaseId // empty")" \
              || fail "could not list the $LANE.yml dispatch runs"
            if [ "$attempt" -ge 2 ] && [ -n "$dispatched" ]; then break; fi
            sleep 10
          done
          [ "$attempt" -ge 2 ] || fail "the rerun of run $RUN had not started after 60 attempts"
          [ -n "$dispatched" ] || fail "no run titled '$NAME $PARENT' had appeared after 60 attempts"
          echo "dispatched=$dispatched" >> "$GITHUB_OUTPUT"
      - name: (e) git revert C applies cleanly to main's tip
        # Runs after a failed rerun step too, so the P0 records (e) on every path.
        if: always() && steps.p0.outcome == 'success'
        id: clean
        run: |
          git fetch origin main
          git checkout --detach origin/main
          if git revert --no-commit "$SHA" > /dev/null 2>&1; then e=true; else e=false; fi
          echo "e=$e" >> "$GITHUB_OUTPUT"
      - name: Update the same P0 with every condition so far, on every path
        if: always() && steps.p0.outputs.id != ''
        env:
          ID: ${{ steps.p0.outputs.id }}
          A: ${{ steps.verdicts.outputs.a }}
          B: ${{ steps.verdicts.outputs.b }}
          DISPATCHED: ${{ steps.reruns.outputs.dispatched }}
          # (b) not true: (c) and (d) were not run. A started pair is pending until the verdict
          # workflow reads both; a rerun step that ran and failed is recorded with its outcome.
          CD: >-
            ${{ steps.verdicts.outputs.b != 'true' && 'not run: (b) not true'
            || steps.reruns.outcome == 'success' && 'pending'
            || format('unknown: the rerun step ended {0}', steps.reruns.outcome) }}
          E: >-
            ${{ steps.reruns.outcome == 'success' && 'pending'
            || steps.clean.outputs.e || format('unknown: the (e) step ended {0}', steps.clean.outcome) }}
        run: |
          # Only literal "true" results open a revert; this job leaves "revert: no", and the
          # verdict workflow writes "revert: yes" only from four literal "true" results.
          printf 'Conditions: (a) %s, (b) %s, (c) %s, (d) %s, (e) %s. revert: no\n' "$A" "$B" "$CD" "$CD" "$E" \
            > "$RUNNER_TEMP/p0-conditions.md"
          # The marker lets the verdict workflow find this P0 from either run's completion.
          if [ -n "$DISPATCHED" ]; then
            printf '<!-- red-main sha=%s run=%s dispatched=%s -->\n' "$SHA" "$RUN" "$DISPATCHED" > "$RUNNER_TEMP/p0-mark.md"
          fi
          cat "$RUNNER_TEMP/p0-head.md" "$RUNNER_TEMP/p0-conditions.md" "$RUNNER_TEMP/p0-mark.md" "$RUNNER_TEMP/p0-commit.md" \
            | gh api --method PATCH "repos/$GH_REPO/issues/comments/$ID" -F body=@- > /dev/null \
            || { echo "::error::could not update the P0 $ID"; exit 1; }
      - if: always()
        env:
          STARTED: ${{ steps.start.outputs.at }}
        run: |
          echo "wall time: $(( $(date +%s) - STARTED )) s" >> "$GITHUB_STEP_SUMMARY"
---
# RIGHT: neutral shape, no citation. The rerun and the parent dispatch each start this
# workflow when they complete, so no job waits on a lane run however long it takes. The
# job that finds both runs completed reads (c), (d) and (e) and edits the P0 in place; one
# that finds its pair still running leaves the P0 to the pair's completion. Two jobs that
# race write the same text.
name: Red main verdict
on:
  workflow_run:
    workflows: [Mutation]
    types: [completed]
jobs:
  verdict:
    # The rerun is attempt 2 or later of a push run; the parent run is a dispatch on main.
    if: >-
      github.event.workflow_run.head_branch == 'main' &&
      (github.event.workflow_run.event == 'workflow_dispatch' ||
      (github.event.workflow_run.event == 'push' && github.event.workflow_run.run_attempt >= 2))
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      contents: read
      actions: read # read the two runs
      pull-requests: write # edit the P0 comment; with issues enabled: `issues: write`
    env:
      GH_TOKEN: ${{ github.token }}
      GH_REPO: ${{ github.repository }}
      KEY: ${{ github.event.workflow_run.event == 'workflow_dispatch' && 'dispatched' || 'run' }}=${{ github.event.workflow_run.id }}
    steps:
      - id: start
        run: echo "at=$(date +%s)" >> "$GITHUB_OUTPUT"
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - name: (c), (d) and (e) once both runs have completed
        run: |
          fail() { echo "::error::$1"; exit 1; }
          # The handler's P0 carries "<!-- red-main sha=<C> run=<rerun> dispatched=<parent run> -->".
          found="$(gh api "repos/$GH_REPO/issues/comments?sort=created&direction=desc&per_page=100" \
            --jq "map(select(.body | contains(\"$KEY \"))) | (.[0] // empty) | .id")" \
            || fail "could not list the repository's comments"
          if [ -z "$found" ]; then
            echo "no red-main P0 names $KEY: a manual rerun or dispatch" >> "$GITHUB_STEP_SUMMARY"
            exit 0
          fi
          body="$(gh api "repos/$GH_REPO/issues/comments/$found" --jq .body)" || fail "could not read the P0 $found"
          mark="$(grep -o 'red-main sha=[0-9a-f]* run=[0-9]* dispatched=[0-9]*' <<< "$body")" \
            || fail "the P0 $found carries no marker"
          read -r _ sha run dispatched <<< "$mark"
          sha="${sha#sha=}"; run="${run#run=}"; dispatched="${dispatched#dispatched=}"
          for r in "$run" "$dispatched"; do
            s="$(gh run view "$r" --json status --jq .status)" || fail "could not read run $r"
            if [ "$s" != completed ]; then
              echo "run $r is $s; its completion finishes the P0 $found" >> "$GITHUB_STEP_SUMMARY"
              exit 0
            fi
          done
          c="$(gh run view "$run" --json conclusion --jq '.conclusion == "failure"')" || fail "could not read run $run"
          d="$(gh run view "$dispatched" --json conclusion --jq '.conclusion == "success"')" \
            || fail "could not read run $dispatched"
          git fetch origin main
          git checkout --detach origin/main
          if git revert --no-commit "$sha" > /dev/null 2>&1; then e=true; else e=false; fi
          revert=no
          if [ "$c" = true ] && [ "$d" = true ] && [ "$e" = true ]; then revert=yes; fi
          # (a) and (b) were true, or no rerun would exist. The patrol opens the revert PR with a
          # user credential only on "revert: yes"; this job never opens one.
          conditions="$(printf 'Conditions: (a) true, (b) true, (c) %s, (d) %s, (e) %s. revert: %s' "$c" "$d" "$e" "$revert")"
          awk -v line="$conditions" '/^Conditions: /{print line; next} {print}' <<< "$body" \
            | gh api --method PATCH "repos/$GH_REPO/issues/comments/$found" -F body=@- > /dev/null \
            || fail "could not update the P0 $found"
      - if: always()
        env:
          STARTED: ${{ steps.start.outputs.at }}
        run: |
          echo "wall time: $(( $(date +%s) - STARTED )) s" >> "$GITHUB_STEP_SUMMARY"
```

Why the handler is its own workflow, on main, with `actions: write`: GitHub's REST reference for "Create a workflow dispatch event" (https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event) defines `ref` as "The git reference for the workflow. The reference can be a branch or tag name.", so the parent's SHA travels as an input. That endpoint and "Re-run failed jobs from a workflow run" (https://docs.github.com/en/rest/actions/workflow-runs#re-run-failed-jobs-from-a-workflow-run) each state "The fine-grained token must have the following permission set: "Actions" repository permissions (write)". "Re-running workflows and jobs" (https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs) reruns a finished run: "To re-run a failed workflow run, use the run rerun subcommand, replacing RUN_ID with the ID of the failed run that you want to re-run."; no GitHub page describes rerunning a run still in progress, so the handler starts after lane L's run completes. A dispatch made with `GITHUB_TOKEN` still starts the lane, because "workflow_dispatch and repository_dispatch events always create workflow runs" (https://docs.github.com/en/actions/concepts/security/github_token). A rerun's completion can fire the handler again, since only `requested` is skipped on a re-run ("The requested activity type does not occur when a workflow is re-run", "Events that trigger workflows", https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run); the attempt gate makes that a no-op.

Why lane L's title carries the SHA: GitHub, "Workflow syntax for GitHub Actions", `run-name` (https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax): "This value can include expressions and can reference the `github` and `inputs` contexts." The handler reads that title back through `gh run list`, whose `--event` and `--branch` options filter runs and whose JSON fields include `displayTitle` and `createdAt` (https://cli.github.com/manual/gh_run_list). A lookup that never finds its run is a failure, so it ends the step after a fixed number of attempts instead of waiting on the 60-minute backstop.

Why the revert PR is not opened by the workflow: GitHub, "GITHUB_TOKEN" (https://docs.github.com/en/actions/concepts/security/github_token): "If you need workflow runs from workflow-created pull requests to execute without requiring approval, use a GitHub App installation access token or a personal access token instead of `GITHUB_TOKEN` when creating or updating the pull request." Why `pull-requests: write` suffices for the comment: the same page says "The `GITHUB_TOKEN` secret is a GitHub App installation access token", and the REST reference for "Create an issue comment" (https://docs.github.com/en/rest/issues/comments) says "You can use the REST API to create comments on issues and pull requests. Every pull request is an issue, but not every issue is a pull request", listing GitHub App installation access tokens with "at least one of the following permission sets: "Issues" repository permissions (write) "Pull requests" repository permissions (write)"; "Update an issue comment" (`PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}`, same page) states the same permission sets, so the handler edits its own P0 under the permission that wrote it.

What the rule decides, on a real red main: in the public stryker-js-effect on 2026-10-10, #276 and #283 merged 4 seconds apart and #283 renamed a field #276 read. #283's Nix, CI and Release runs went red (38072120188, 38072120209, 38072120373). #276's Nix run (38072116236) was cancelled, so it gets a P0 of its own whose (a) reads "not red: the run ended cancelled", with nothing rerun; and on the Nix lane condition (b) fails for #283: the handler spends no rerun or dispatch, records (c) and (d) as not run, no revert PR opens, and the P0 names the range #276..#283 with the failing jobs. The root fix, #295 (`65ecde3cbe`), landed about two hours later with CI green (38080274552).

Grounds: Henderson, Kondareddy, Azad, Nickell, "SafeRevert: When Can Breaking Changes be Automatically Reverted?", ICST 2024 (https://hackthology.com/saferevert-when-can-breaking-changes-be-automatically-reverted.html): "A change is safe to revert if it is a true culprit", with safety stated as "precision must be above 99%"; and "All of these problems behave in _version non-hermetic_ ways, where failures may not be strictly linked to the version of code executed." John Micco, "Flaky Tests at Google and How We Mitigate Them", 2016-05-27 (https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html): "about 84% of the transitions we observe from pass to fail involve a flaky test". For (e), Henderson et al., "Taming the Variants", ICST 2026 (https://hackthology.com/taming-the-variants-multi-architecture-continuous-testing-at-google.html): "a bug-introducing change can be automatically reverted without review, provided there haven't been further changes that would cause merge conflicts".

Gate: `review`. Does the diff's handling of a push run on main that ends `failure`, `cancelled`, `timed_out` or `startup_failure` fail to write a P0 (an issue under an `issues: write` it declares, or, with issues disabled, a comment on the culprit's merged pull request under a `pull-requests: write` it declares), or fail to name the commit the culprit when its run failed and its first parent is green on the lane? Does it gate the handler on `failure` alone, so a cancelled or timed-out verdict files nothing, or rerun anything for a run that did not end `failure`? For a push no merged pull request carries, or a pull-request lookup or comment write that fails, does it end without the P0 in the run's step summary and a red handler job? Can a failed lookup before the P0 (a verdict, a job list, the pull request or the author) end the handler before any P0 exists? Does the P0 call a commit the culprit when that commit's first parent is not green on the lane? Does a job that reruns failed jobs or dispatches lane L leave `actions: write` undeclared? Does it rerun a run that has not completed (a job inside lane L's own run), dispatch the lane with the parent's SHA as its ref instead of on main with the SHA as an input, or act on any attempt but the first? Does it read a lane's verdict from anything but the lane's workflow run for that commit's push? Does it find the run it dispatched by anything but the title lane L's `run-name` builds from `inputs.sha` (with the push SHA as fallback), the `workflow_dispatch` event, the `main` branch and a creation time after the dispatch, or does lane L's workflow in the diff lack that `run-name`? Does it leave a `gh` call's failure unchecked, or poll in a loop with no attempt bound, so a failed call or a missing run waits until the backstop? Does any job wait on the rerun or the dispatched run (`gh run watch`, a poll until completion) instead of a separate verdict workflow on those runs' own `workflow_run` completions, which acts only once both have completed? Does it write the P0 only after waiting on reruns, or spend a rerun or a dispatch when (b) is not true? Does a step that updates the P0 lack `if: always()` or a checked write, record a rerun or dispatch that ran and failed as not run, or compute "revert: yes" from anything but literal `true` results for (a)-(e)? Does it open a revert PR without all five confidence conditions, open one with `GITHUB_TOKEN`, or merge one without the pull-request gate? Does the P0 body carry the commit's subject, author or message outside a fenced block with `@` neutralized?
