---
title: A release reads the commit's recorded verdicts and promotes what they proved, never rebuilding or retesting it
applies_when:
  - adding or changing a release, deploy, tag or publish job or workflow
  - adding a `needs:`, a build step or a test step to a release workflow
  - adding a scripted check that runs against a deployed stage
  - adding or changing a machine-image build, an AMI or launch template, or the pipeline that promotes an image to the runner fleet or rolls it out
  - changing the self-hosted runner configuration an image carries (job hooks, their environment, labels)
  - changing what proves an image ready, its bake period, the credential that moves the fleet pointer, or its rollback
tags: [ci, workflows, release, deploy, promotion, verdicts, staging, machine-image, runners, rollout]
---

A release that rebuilds and retests ships something main never judged and waits on suites main already ran. In the public effect-endgame-starter-kit, the production deploy `needs: [ci, plan, mutation]` and deploys from the checked-out source (`nix develop --command pnpm run deploy`, which runs `alchemy deploy`), so a release waits on mutation shards whose jobs carry `timeout-minutes: 75` and then ships no artifact a verdict recorded (`.github/workflows/release-gate.yml:40,79-97`). The shared release workflow this repo calls builds `.#workspace-tarballs` again inside the release job (`pnpm-release-management` `.github/workflows/release.yml:55-57,124`). A private product repo also runs a scripted check against its deployed staging stage after each deploy (org CI audit, 2026-10-11).

A coding agent that treats a hermetic VM test as fleet proof ships an image no runner has used. An unnamed private fleet, 2026-10-12: the image installed a runner job hook without its `.sh` extension. The image's VM test booted it and ran the hook and job scripts by hand, bypassing the runner, so it passed; the runner itself does not run a hook without an extension, and the image took the fleet down from 13:36Z. A pointer moved by hand, with nothing watching the canary and nothing to move it back, turns one bad image into a fleet outage that lasts until a person notices.

## Rule

A release reads every workflow run the push of the exact commit it releases started, other than its own, each at its latest attempt, never a hand-kept list of lanes, and releases only when every one succeeded. It fails closed when a run did not succeed or none is recorded, starts on every lane's completion whatever its conclusion so a cancelled or red lane fails it loudly, and releases nothing while one is still running. A release that itself runs on push leaves its own run out of that read; the pipeline that moves the artifact is never its own gate. It never reruns tests, never `needs:` a test job, and nothing scripted runs against a deployed stage. A runner or machine image reaches the fleet only through the pipeline, after a canary runner built from it has taken real jobs through a stated bake period, and rolls back to the last known-good image on its own when the canary or the rollout fails or alarms.

- **Deployed product:** promotes the digest staging recorded. It builds nothing.
- **Library** (git tags plus GitHub Releases, with the flake as the channel): tags the main commit whose recorded postsubmit verdicts are green, and publishes flake outputs that substitute from the cache (`flake-outputs-build-once-on-main`); it never rebuilds them.
- **Runner or machine image:** reaches the fleet only after a canary runner booted from that exact image has taken real jobs end to end through the runner, hooks included, and they passed. The image's VM or configuration test still runs first, but a test that runs hooks or job scripts by hand, bypassing the runner, is not proof. Canary proof is staged real usage: ordinary jobs routed to one runner before the fleet pointer moves. It is not a scripted check against a deployed stage, so it does not contradict the rule's last clause.
  - **Bake period:** the canary takes real jobs for a stated period, written next to the promotion step, and the pointer moves only when that period ends with its jobs passed and no alarm. No job waits out the bake: one job records when the canary started, and a later scheduled or dispatched promotion job reads the elapsed time and the canary's job results, so every job stays under `one-stuck-job-backstop`'s 60 minutes however long the bake is.
  - **Pipeline-controlled promotion:** only the pipeline moves the fleet pointer, and only after the bake. No person and no ad-hoc script moves it. The credential that moves the pointer belongs to the pipeline's infrastructure (the runner's identity, or a role scoped to that one update), never a workflow secret or a key file in the promotion job, as `flake-outputs-build-once-on-main` says of the substituter's signing key.
  - **Automatic rollback:** the pipeline records the last known-good image before it moves the pointer, and moves it back to that image on its own when the canary's jobs fail, a fleet alarm fires, or the rollout fails.

```yaml
# WRONG: systemfsoftware/effect-endgame-starter-kit 375e468:.github/workflows/release-gate.yml:79-97
# Waits on the test lanes, then deploys from source in the dev shell, not a recorded artifact.
  deploy:
    name: deploy · production
    needs: [ci, plan, mutation]
    if: ${{ !github.event.repository.is_template }}
    runs-on: ubuntu-latest
    timeout-minutes: 45
    env:
      ALCHEMY_STAGE: prod
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      SITE_DOMAIN: ${{ vars.SITE_DOMAIN }}
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: ./.github/actions/cloudflare-secrets
      - uses: ./.github/actions/dev-shell
      - name: Deploy production
        run: nix develop --command pnpm run deploy

# WRONG: systemfsoftware/pnpm-release-management 8cd6e83009:.github/workflows/release.yml:55-57
# Defined in the plan job and reused at :124 in the release job: the release rebuilds
# the tarballs it publishes.
      - &workspace-tarballs
        name: Pack the workspace through the caller's flake
        run: echo "TARBALLS=$(nix build --no-link --print-out-paths .#workspace-tarballs)" >> "$GITHUB_ENV"

# WRONG: neutral shape of an unnamed pattern (2026-10-12). The runner's environment names a
# hook with no extension, ACTIONS_RUNNER_HOOK_JOB_STARTED=/opt/runner/hooks/job-started; the
# VM test runs that hook by hand, which works, and the fleet pointer moves on that test alone.
      - run: nix build .#checks.x86_64-linux.runner-image-vm-test # runs hooks/job scripts by hand
      - run: ./scripts/move-fleet-pointer.sh "$IMAGE_DIGEST"

# RIGHT: neutral shape, staged real usage. The hook keeps its extension,
# ACTIONS_RUNNER_HOOK_JOB_STARTED=/opt/runner/hooks/job-started.sh, and the VM test still
# runs. Then the pipeline boots one canary runner from the same image digest with the
# fleet's labels, so ordinary jobs land on it, and records when the canary started. A later
# scheduled promotion job, under the 60-minute backstop like every job, reads the elapsed
# time and the canary's job results; once the stated bake (here 2 hours, BAKE_SECONDS=7200)
# has passed with every job green and no alarm, it records the current digest as last
# known-good and moves the fleet pointer, using a credential its runner holds. If the canary
# fails, it is drained and the fleet never moves; if the rollout fails or alarms, the
# pipeline moves the pointer back to the last known-good digest without a person.

# RIGHT: neutral shape, library release. It starts when any postsubmit lane's run on a main
# push completes, whatever its conclusion, reads every push run recorded on that commit (a
# run's conclusion is its latest attempt's), releases only when all succeeded, fails closed
# when one did not succeed, and builds nothing. A lane still running releases nothing now;
# its own completion starts this workflow again.
on:
  workflow_run:
    # Every workflow that runs on a push to main in this neutral repo; TRIGGERS below repeats
    # these names, so a lane left out fails the release loudly instead of never refiring it.
    workflows: [CI, E2E]
    types: [completed]
    branches: [main]
concurrency:
  group: release-${{ github.event.workflow_run.head_sha }}
  cancel-in-progress: false
jobs:
  release:
    # No conclusion gate: a cancelled or failed trigger still runs the read below, which
    # fails this job loudly instead of skipping the release in silence.
    if: github.event.workflow_run.event == 'push'
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      contents: write
      actions: read # list each lane's workflow runs
    steps:
      - id: start
        run: echo "at=$(date +%s)" >> "$GITHUB_OUTPUT"
      - name: Every push run recorded on this commit is green
        id: verdicts
        env:
          GH_TOKEN: ${{ github.token }}
          SHA: ${{ github.event.workflow_run.head_sha }}
          TRIGGERS: CI,E2E # the names under `workflows:` above
        run: |
          # Every workflow a push to main starts judges main, so the set read here is every push
          # run on $SHA, never a hand-kept lane list: a lane added later is read with no edit.
          # This workflow runs on `workflow_run`, so it is not among them.
          runs="$(gh api --paginate "repos/$GITHUB_REPOSITORY/actions/runs?head_sha=$SHA&event=push&per_page=100" \
            --jq '.workflow_runs[] | "\(.name)\t\(if .status != "completed" then .status else .conclusion end)"')" \
            || { echo "::error::could not read the push runs on $SHA"; exit 1; }
          [ -n "$runs" ] || { echo "::error::no push run is recorded on $SHA"; exit 1; }
          while IFS=$'\t' read -r lane verdict; do
            case "$verdict" in
              success) ;;
              queued | in_progress | waiting | pending | requested)
                # Only a trigger's completion starts this workflow again; a running lane outside
                # the trigger list would leave the commit unreleased with no error.
                case ",$TRIGGERS," in
                  *",$lane,"*) ;;
                  *) echo "::error::lane $lane runs on a push to main but is not under workflow_run.workflows"; exit 1 ;;
                esac
                echo "lane $lane is $verdict on $SHA; its completion runs this release again" >> "$GITHUB_STEP_SUMMARY"
                echo "ready=false" >> "$GITHUB_OUTPUT"
                exit 0
                ;;
              *)
                echo "::error::lane $lane's push run on $SHA is $verdict"
                exit 1
                ;;
            esac
          done <<< "$runs"
          echo "ready=true" >> "$GITHUB_OUTPUT"
      # if: steps.verdicts.outputs.ready == 'true': tag $SHA (an existing tag is skipped) and
      # publish the flake outputs, substituted from the cache.
      - if: always()
        env:
          STARTED: ${{ steps.start.outputs.at }}
        run: |
          echo "wall time: $(( $(date +%s) - STARTED )) s" >> "$GITHUB_STEP_SUMMARY"
#
# Deployed product, same shape: read the recorded verdicts, then promote the digest
# staging recorded for this commit. No build step, no test job in `needs:`.
```

Why the workflow run and not check runs: a check run is named after a job, and GitHub's "List check runs for a Git reference" (https://docs.github.com/en/rest/checks/runs#list-check-runs-for-a-git-reference) filters by name: "Returns check runs with the specified `name`." In this repo, `check_name=mutation` on main's `02bf9653b1` returns no check run, because each is named for a job ("mutation / mutation · answer"), so such a read fails every release; and a test that all of a lane's check runs succeeded fails a lane whose in-diff run skips jobs. A workflow run carries the lane's one verdict. "List workflow runs for a repository" (https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository), `GET /repos/{owner}/{repo}/actions/runs`, takes `event` among its filters and narrows by commit: "Only returns workflow runs that are associated with the specified head\_sha.". On `02bf9653b1` with `event=push` it returns this repo's four push runs (Release, CI, Consumer fixture, Nix), each `completed`/`success`. Reading every push run instead of a list of lanes means a heavy lane added later is judged with no edit to the release; the "List workflow runs for a workflow" variant (https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-workflow) needs the lane named, which is that list. Both need "The fine-grained token must have the following permission set: "Actions" repository permissions (read)".

Grounds: _Software Engineering at Google_ ch. 23, "Release candidate testing" (https://abseil.io/resources/swe-book/html/ch23.html), argues the other way: "There are several reasons why it's important to run a comprehensive, automated test suite against an RC, even if it is the same suite that CB just ran against the code on post-submit". Its reasons are a sanity check that "nothing strange happened when the code was cut and recompiled in the RC", auditability, cherry picks and emergency pushes. Promoting the recorded build removes each one: nothing is cut or recompiled, the verdicts are attached to the commit the release names, and a cherry pick or emergency fix is a new main commit with its own verdicts.

Grounds for the canary: GitHub, "Running scripts before or after a job" (https://docs.github.com/actions/hosting-your-own-runners/running-scripts-before-or-after-a-job): "Your script files must use a file extension for the relevant language, such as .sh or .ps1, in order to run successfully", and "the environment variable must contain the absolute path to the script". Both are facts about how the runner starts a hook, so only a job the runner itself runs can show them hold; a test that calls the script directly cannot. AWS, "Manage components" for EC2 Image Builder (https://docs.aws.amazon.com/imagebuilder/latest/userguide/manage-components.html), tests the real image before release: "Image Builder launches an EC2 instance from the snapshot that it created as the final step of the build stage. Tests run on the new instance to validate settings and ensure that the instance is functioning as expected." The canary goes one step further: after that test, the image's own runner takes real jobs before the fleet moves. For the bake and the rollback, AWS's `RefreshPreferences` (https://docs.aws.amazon.com/autoscaling/ec2/APIReference/API_RefreshPreferences.html) defines `BakeTime` as "The amount of time, in seconds, to wait at the end of an instance refresh before the instance refresh is considered complete" and `AutoRollback` as whether "to roll back the Auto Scaling group to its previous configuration if the instance refresh fails or a CloudWatch alarm threshold is met"; its rollback guide (https://docs.aws.amazon.com/autoscaling/ec2/userguide/instance-refresh-rollback.html) says "Amazon EC2 Auto Scaling automatically reverses what was deployed if the instance refresh fails for some reason or if any CloudWatch alarms you specify go into the ALARM state." The rule asks for those three properties in whatever pipeline the fleet uses, not for that service.

Gate: `review`. Does the release read verdicts from anything but the workflow runs recorded for the push of the exact commit it releases, read a hand-kept list of lanes instead of every push run on that commit, release while one is still running, or proceed when a run did not succeed or none is recorded? Does its `workflow_run` trigger list leave out a workflow that runs on a push to main, does a step that finds a lane still running end without failing when that lane is not under the trigger list (so nothing ever starts the release again), or does a job-level `if` on the triggering run's conclusion skip the release in silence when a lane is cancelled or red? Does it rebuild from source, rerun tests, or `needs:` a test job? Does a deployed release promote anything but the digest staging recorded? Does anything scripted run against a deployed stage? Does the diff move a runner or machine image to the fleet before a canary runner booted from that image has taken real jobs through the runner, or count as that proof a VM test that runs hooks or job scripts by hand? Does it promote an image with no bake period stated beside the promotion step, let anything but the pipeline move the fleet pointer (a manual step, an ad-hoc script, a person's credential), or move the pointer without first recording the last known-good image and rolling back to it automatically when the canary fails, an alarm fires or the rollout fails? Does one job wait out the bake (a sleep or poll inside a job instead of a later job reading the elapsed time), or does the promotion job take the pointer credential from a workflow secret or a key file?
