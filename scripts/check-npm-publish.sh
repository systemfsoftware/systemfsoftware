#!/usr/bin/env bash
# check-npm-publish.sh — report which workspace packages are unpublished and which lack OIDC publishing.
#
# For every non-private workspace package (discovered via `pnpm ls -r`, same as release.mjs):
#   1. Query the npm registry for the package (404 = never published).
#   2. If published, check the latest version's dist.attestations (present = published via
#      OIDC trusted publishing + provenance; absent = no OIDC/provenance evidence on npm).
#   3. Report local package.json version vs. npm latest so "published but stuck" is visible.
#
# Exit code 0 always (informational). Use --check to fail (exit 1) when any package is
# unpublished or lacks OIDC attestation evidence.
#
# Requires: curl, jq, pnpm (for workspace discovery).

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
registry="${NPM_REGISTRY:-https://registry.npmjs.org}"
check_mode=false
preflight_mode=false

usage() {
  echo "Usage: $0 [--check] [--json] [--preflight]" >&2
  echo "  --check     exit 1 if any non-private package is unpublished or lacks OIDC attestations" >&2
  echo "  --json      emit a machine-readable JSON report" >&2
  echo "  --preflight exit 1 if any non-private package has never been published (the release gate)" >&2
  echo "  NPM_REGISTRY env overrides the registry base URL" >&2
  exit 2
}

json_mode=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) check_mode=true ;;
    --json) json_mode=true ;;
    --preflight) preflight_mode=true ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
  shift
done

# --- 1. Discover non-private workspace packages -------------------------------------------
mapfile -t pkgs < <(
  cd "$repo_root" && pnpm ls -r --depth=-1 --json 2>/dev/null \
    | jq -r '.[] | select(.private != true) | [.name, .path] | @tsv'
)

if [[ ${#pkgs[@]} -eq 0 ]]; then
  echo "error: no non-private workspace packages discovered (pnpm ls -r failed?)" >&2
  exit 2
fi

# --- 2. Per-package registry + config checks ----------------------------------------------
declare -A local_version=()
declare -A pkg_path=()
declare -A provenance_config=()
declare -A repo_field=()
declare -A npm_status=()   # published | unpublished | error
declare -A npm_latest=()
declare -A npm_attested=() # yes | no

for row in "${pkgs[@]}"; do
  name="${row%%$'\t'*}"
  path="${row#*$'\t'}"
  pkg_json="$path/package.json"

  local_version["$name"]="$(jq -r '.version // "?"' "$pkg_json")"
  pkg_path["$name"]="$path"
  provenance_config["$name"]="$(jq -r 'if .publishConfig.provenance == true then "yes" else "no" end' "$pkg_json")"
  repo_field["$name"]="$(jq -r 'if (.repository.url // "") != "" then "yes" else "no" end' "$pkg_json")"

  encoded="$(jq -rn --arg v "$name" '$v | @uri')"
  body="$(curl -sS --max-time 30 -H 'Accept: application/json' "$registry/$encoded" 2>/dev/null || true)"
  if [[ -z "$body" ]]; then
    npm_status["$name"]="error"
    npm_latest["$name"]="?"
    npm_attested["$name"]="no"
    continue
  fi
  if jq -e 'type == "object" and has("error") and .error == "Not found"' <<<"$body" >/dev/null 2>&1; then
    npm_status["$name"]="unpublished"
    npm_latest["$name"]="—"
    npm_attested["$name"]="no"
    continue
  fi
  if ! jq -e 'type == "object" and has("dist-tags")' <<<"$body" >/dev/null 2>&1; then
    npm_status["$name"]="error"
    npm_latest["$name"]="?"
    npm_attested["$name"]="no"
    continue
  fi

  npm_status["$name"]="published"
  npm_latest["$name"]="$(jq -r '."dist-tags".latest // "?"' <<<"$body")"
  npm_attested["$name"]="$(
    jq -r 'if (.versions[."dist-tags".latest].dist.attestations // null) != null then "yes" else "no" end' <<<"$body"
  )"
done

# --- 3. Classify --------------------------------------------------------------------------
#   unpublished : 404 on npm — never published
#   no-oidc     : published, but latest version has no provenance attestation (no OIDC evidence)
#   stuck       : published + attested, but local version is newer than npm latest
#   ok          : published, attested, local == npm latest
declare -A klass=()
for name in "${!local_version[@]}"; do
  case "${npm_status[$name]}" in
    unpublished) klass["$name"]="unpublished" ;;
    error)       klass["$name"]="error" ;;
    published)
      if [[ "${npm_attested[$name]}" == "no" ]]; then
        klass["$name"]="no-oidc"
      elif [[ "${local_version[$name]}" != "${npm_latest[$name]}" ]]; then
        klass["$name"]="stuck"
      else
        klass["$name"]="ok"
      fi
      ;;
  esac
done

# --- 4. Report ----------------------------------------------------------------------------
if $json_mode; then
  for name in "${!local_version[@]}"; do
    jq -cn \
      --arg name "$name" \
      --arg local "${local_version[$name]}" \
      --arg latest "${npm_latest[$name]}" \
      --arg klass "${klass[$name]}" \
      --arg attested "${npm_attested[$name]}" \
      --arg provenance "${provenance_config[$name]}" \
      --arg repo "${repo_field[$name]}" \
      '{name: $name, local_version: $local, npm_latest: $latest, class: $klass, attested: $attested, publishConfig_provenance: $provenance, repository_url: $repo}'
  done
  exit 0
fi

echo "npm publish status — $(date -u +%Y-%m-%dT%H:%MZ) — registry: $registry"
echo "workspace packages: ${#local_version[@]}"
echo ""

print_pkg() {
  local name="$1" k="$2"
  printf '  %-55s local %-8s npm %-10s provenance:%s\n' \
    "$name" "${local_version[$name]}" "${npm_latest[$name]}" "${provenance_config[$name]}"
}

count() {
  local k="$1" n=0
  for name in "${!klass[@]}"; do [[ "${klass[$name]}" == "$k" ]] && n=$((n + 1)); done
  echo "$n"
}

echo "== UNPUBLISHED (404 on npm) =="
for name in "${!klass[@]}"; do [[ "${klass[$name]}" == "unpublished" ]] && print_pkg "$name" unpublished; done
echo ""
echo "== PUBLISHED, NO OIDC ATTESTATION (latest has no provenance; trusted publisher likely unconfigured) =="
for name in "${!klass[@]}"; do [[ "${klass[$name]}" == "no-oidc" ]] && print_pkg "$name" no-oidc; done
echo ""
echo "== PUBLISHED + ATTESTED, BUT LOCAL AHEAD (stuck — release tagged but not landed) =="
for name in "${!klass[@]}"; do [[ "${klass[$name]}" == "stuck" ]] && print_pkg "$name" stuck; done
echo ""
echo "== PUBLISHED + ATTESTED, CURRENT =="
for name in "${!klass[@]}"; do [[ "${klass[$name]}" == "ok" ]] && print_pkg "$name" ok; done

echo ""
echo "== summary =="
printf '  unpublished: %s\n' "$(count unpublished)"
printf '  no-oidc:     %s\n' "$(count no-oidc)"
printf '  stuck:       %s\n' "$(count stuck)"
printf '  ok:          %s\n' "$(count ok)"
if [[ "$(count error)" -gt 0 ]]; then printf '  error:       %s\n' "$(count error)"; fi

# --- 5a. --preflight gate -----------------------------------------------------------------
# Fails on the one class npm OIDC provably cannot serve: a package that has never been
# published. npm-trust's prerequisites require the package to already exist on the registry,
# so no trusted publisher can be registered for it, and `pnpm publish -r` would reach it
# mid-batch and abort with an OIDC auth error after publishing its predecessors.
#
# `no-oidc` is deliberately NOT a failure here: a previously unattested version says nothing
# about whether a trusted publisher is registered now, and registration cannot be read
# without authenticating, which this script does not do. This is a publishability preflight,
# not a registration preflight — the honest scope.
#
# The bootstrap runbook lives in docs/solutions/tooling-decisions/. Its path stays in this
# comment and never in an echo: guard-script-provenance.mjs Arm 1 treats a doctrine path in
# a non-comment shell line as a doctrine read and fails the build.
if $preflight_mode; then
  slug="$(git -C "$repo_root" remote get-url origin 2>/dev/null \
    | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##' || true)"
  slug="${slug:-<owner>/<repo>}"
  echo ""
  if [[ "$(count unpublished)" -eq 0 && "$(count error)" -eq 0 ]]; then
    echo "PREFLIGHT OK: every non-private workspace package exists on the registry."
  else
    echo "::error::preflight failed — $(count unpublished) package(s) have never been published, $(count error) unqueryable. OIDC cannot debut a package; bootstrap each one from a maintainer machine, then re-run." >&2
    for name in "${!klass[@]}"; do
      [[ "${klass[$name]}" == "unpublished" || "${klass[$name]}" == "error" ]] || continue
      echo "" >&2
      echo "  $name (${pkg_path[$name]#"$repo_root"/}) — ${klass[$name]}" >&2
      echo "    corepack pnpm --filter $name build" >&2
      echo "    corepack pnpm --filter $name publish --access public --no-git-checks" >&2
      echo "    npm trust github $name --repo $slug --file release.yml --allow-publish --yes" >&2
    done
    exit 1
  fi
fi

# --- 5. --check gate ----------------------------------------------------------------------
if $check_mode; then
  bad="$(count unpublished)$(( $(count no-oidc) + $(count error) ))"
  if [[ "$(count unpublished)" -gt 0 || "$(count no-oidc)" -gt 0 || "$(count error)" -gt 0 ]]; then
    echo ""
    echo "FAIL: $(count unpublished) unpublished, $(count no-oidc) without OIDC attestation, $(count error) unqueryable" >&2
    exit 1
  fi
  echo ""
  echo "OK: every package is published and carries provenance attestations."
fi
