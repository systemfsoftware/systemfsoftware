# Installs the effect-schema-law tarball into a consumer outside the monorepo,
# offline from lib.mkConsumerStore, and proves a plain consumer needs no fork:
# the packed manifest resolves no @systemfsoftware/* package, vitest is an
# optional peer, dist imports no fork, and under upstream vitest the laws pass
# through every registration lane (sync, Effect, deterministic) while a broken
# codec fails by refutation, not by a generation error.
# consumer-load-check proves the toolchain configs load; this one proves the
# laws run.
#
# pnpm-lock.yaml is the consumer's lockfile with the workspace tarball's file
# name, version and integrity left as @effect-schema-law.*@, filled here from
# the flake's own tarball. Registry packages stay literal. When the packed
# manifest's dependencies or peers change, the frozen install fails; regenerate
# the template then: pack the changed package, write `manifest` below with the
# tarball in .sfs-deps/, run `pnpm install --lockfile-only`, and put the
# placeholders back.
{ pkgs, mkConsumerStore, workspace }:
let
  inherit (pkgs) lib;
  member = lib.findFirst (m: m.attr == "effect-schema-law")
    (throw "schema-law-consumer-check: no public workspace package named effect-schema-law")
    workspace.workspace-tarballs.members;
  tarball = workspace.effect-schema-law;
  spec = "file:.sfs-deps/${member.tarball}";

  manifest = builtins.toJSON {
    name = "schema-law-consumer-check";
    version = "0.0.0";
    private = true;
    dependencies = {
      "@systemfsoftware/effect-schema-law" = spec;
      effect = "4.0.5";
      vitest = "5.0.5";
    };
  };

  lockTemplate = ./pnpm-lock.yaml;

  # The laws a plain consumer registers: a branded string (the sync lane), a
  # single-inhabitant literal (the deterministic lane), and a budget-less
  # recursive union whose fields suspend again (the sync and Effect lanes of
  # recursionLaws, sampled at the crossings one nesting level costs).
  goodLaws = builtins.toFile "law-good.test.ts" ''
    import { recursionLaws, ruleOfSchemas } from '@systemfsoftware/effect-schema-law'
    import { Schema as S } from 'effect'

    interface Binary {
      readonly _tag: 'Binary'
      readonly left: Expr
      readonly right: Expr
    }
    type Expr =
      | { readonly _tag: 'Lit'; readonly value: number }
      | { readonly _tag: 'Id'; readonly name: string }
      | Binary

    const Lit = S.TaggedStruct('Lit', { value: S.Finite })
    const Id = S.TaggedStruct('Id', { name: S.String })
    const Binary = S.TaggedStruct('Binary', {
      left: S.suspend((): S.Schema<Expr> => Expr),
      right: S.suspend((): S.Schema<Expr> => Expr),
    })
    const Expr: S.Schema<Expr> = S.suspend(
      (): S.Schema<Expr> => S.Union([Lit, Id, Binary]) as unknown as S.Schema<Expr>,
    )

    ruleOfSchemas('Email', S.String.pipe(S.brand('Email')))
    ruleOfSchemas('Single', S.Literal(1))
    recursionLaws('Expr', Expr)
  '';

  # A codec whose decode is not the inverse of encode: every value refutes the
  # round-trip law, and the string schema's arbitrary derives without help, so
  # the failure is a refutation rather than a generation error.
  brokenLaw = builtins.toFile "law-broken.test.ts" ''
    import { ruleOfSchemas } from '@systemfsoftware/effect-schema-law'
    import { Schema as S, SchemaTransformation } from 'effect'

    const Broken = S.String.pipe(
      S.decodeTo(
        S.String,
        SchemaTransformation.transform({
          decode: (encoded: string) => encoded + '!',
          encode: (decoded: string) => decoded + '!',
        }),
      ),
    )

    ruleOfSchemas('Broken', Broken, { runs: 10 })
  '';

  substitutions = ''
    -e "s|@effect-schema-law.tgz@|${member.tarball}|g" \
    -e "s|@effect-schema-law.version@|${member.version}|g" \
    -e "s|@effect-schema-law.integrity@|sha512-$(openssl dgst -sha512 -binary ${tarball} | base64 -w0)|g" \
  '';

  src = pkgs.runCommand "schema-law-consumer-check-src" { nativeBuildInputs = [ pkgs.openssl ]; } ''
    mkdir -p "$out"
    printf '%s\n' ${lib.escapeShellArg manifest} > "$out/package.json"
    printf 'packages: []\n' > "$out/pnpm-workspace.yaml"
    sed ${substitutions} ${lockTemplate} > "$out/pnpm-lock.yaml"
  '';

  store = mkConsumerStore {
    inherit pkgs src;
    packages = [ "effect-schema-law" ];
    lockFile = lockTemplate;
  };
in
pkgs.runCommand "schema-law-consumer-check" { nativeBuildInputs = [ pkgs.openssl pkgs.pnpm_12 pkgs.nodejs_24 pkgs.jq ]; } ''
  export HOME="$TMPDIR"
  fail() { echo "schema-law-consumer-check: $1" >&2; exit 1; }

  # 1. The packed manifest and dist carry no fork, and vitest is optional.
  packed="$(tar -xzOf ${tarball} package/package.json)"
  forked="$(printf '%s' "$packed" | jq -r '(.dependencies // {}) + (.peerDependencies // {}) + (.optionalDependencies // {}) | keys | map(select(startswith("@systemfsoftware/"))) | join(",")')"
  if [ -n "$forked" ]; then fail "the packed manifest resolves $forked — a plain consumer cannot install it"; fi
  printf '%s' "$packed" | jq -e '.peerDependencies | has("effect") and has("vitest")' >/dev/null \
    || fail "the packed peers are not effect + vitest"
  printf '%s' "$packed" | jq -e '.peerDependenciesMeta.vitest.optional == true' >/dev/null \
    || fail "vitest is not an optional peer"
  # A module specifier naming the fork or one of its subpaths; the `test.provide` key
  # "@systemfsoftware/vitest:property-check" is data the run budget is read under, not an import.
  # grep reads a file, not the tar stream: an early match closes the pipe and
  # pipefail would turn the found import into a non-match.
  tar -xzOf ${tarball} package/dist/index.mjs > "$TMPDIR/index.mjs"
  if grep -Eq "[\"']@systemfsoftware/vitest(/[^\"']*)?[\"']" "$TMPDIR/index.mjs"; then
    fail "dist/index.mjs imports @systemfsoftware/vitest"
  fi

  # 2. Offline install of the packed tarball with upstream vitest.
  cp -r ${src} consumer && chmod -R u+w consumer
  mkdir consumer/.sfs-deps
  cp ${tarball} consumer/.sfs-deps/${member.tarball}

  # pnpm writes to the store's index.db, so it gets a private copy beside
  # links to the read-only content files.
  for layout in ${store}/v*; do
    mkdir -p "store/''${layout##*/}"
    for entry in "$layout"/*; do
      if [ "''${entry##*/}" = index.db ]; then
        cp "$entry" "store/''${layout##*/}/index.db" && chmod u+w "store/''${layout##*/}/index.db"
      else
        ln -s "$entry" "store/''${layout##*/}/''${entry##*/}"
      fi
    done
  done

  cd consumer
  pnpm_config_store_dir="$TMPDIR/store" \
  pnpm_config_offline=true \
  pnpm_config_frozen_lockfile=true \
  pnpm_config_trust_lockfile=true \
  pnpm_config_ignore_scripts=true \
  pnpm_config_manage_package_manager_versions=false \
  pnpm_config_package_import_method=copy \
    pnpm install --reporter=append-only >/dev/null \
    || fail "the offline install of the packed tarball failed"

  # 3. Every registration lane passes under upstream vitest.
  cp ${goodLaws} law-good.test.ts
  pnpm exec vitest run law-good.test.ts --reporter=json --outputFile=good.json >/dev/null 2>&1 \
    || { jq -r '.testResults[]? | (.message // empty), (.assertionResults[]? | select(.status == "failed") | .fullName, .failureMessages[]?)' good.json >&2 2>/dev/null; fail "the law file failed under upstream vitest"; }
  for law in "Email_=x" "EmailEnc_=x" "Single_=x" "ExprNesting" "ExprVariants" "Expr_DepthPlusOne"; do
    jq -e --arg law "$law" \
      'any(.testResults[]?.assertionResults[]?; .status == "passed" and (.fullName | contains($law)))' good.json >/dev/null \
      || fail "law $law did not pass under upstream vitest"
  done

  # 4. A broken codec fails by refutation, with the counterexample named.
  cp ${brokenLaw} law-broken.test.ts
  if pnpm exec vitest run law-broken.test.ts --reporter=json --outputFile=broken.json >/dev/null 2>&1; then
    fail "the broken codec's round-trip law passed"
  fi
  jq -e 'any(.testResults[]?.assertionResults[]?; .status == "failed" and (.fullName | contains("Broken_=x")))' broken.json >/dev/null \
    || fail "the broken codec failed without the round-trip law failing by name"
  # grep reads a file, not the jq pipe: grep -q exits at the first match and
  # pipefail would fail the check exactly when it passed.
  jq -r '[.testResults[]?.assertionResults[]?.failureMessages[]?] | join("\n")' broken.json > "$TMPDIR/failures.txt"
  grep -q "refuted" "$TMPDIR/failures.txt" \
    || fail "the broken codec failed without a refutation"
  touch "$out"
''
