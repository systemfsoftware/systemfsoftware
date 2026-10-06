# The two generator CLIs as `apps`, and the `checks` that exercise them.
#
# The packages come from #606: `workspace.<attr>` is the tarball it packs for
# that package and `workspace.pnpm-store` is the offline pnpm store. Nothing is
# rebuilt here — the app extracts #606's tarball and runs its bin inside prm's
# sandbox.
#
# pnpm resolves a range offline only from a lockfile (the store holds packages,
# not registry metadata), and a packed tarball rewrites `workspace:^` to a bare
# version, so the tarball alone has no resolvable tree. The scratch prefix is
# therefore this workspace's own manifests and lockfile — the lockfile the store
# was fetched for — with each member's files replaced by #606's tarball for that
# member. `pnpm install --frozen-lockfile` then resolves every range from that
# lockfile and every file from the store, and the bin that runs is the tarball's.
{ lib, pkgs, src, workspace, sandbox }:
let
  nodejs = pkgs.nodejs_24;
  pnpm = pkgs.pnpm_12;

  members = workspace.workspace-tarballs.members;

  memberOf = attr:
    let
      member = lib.findFirst (candidate: candidate.attr == attr) null members;
    in
    assert member != null || throw "nix/generators.nix: ${attr} is not a public workspace package";
    member;

  manifestOf = member: lib.importJSON (src + "/${member.dir}/package.json");

  # The bin `pnpm pack` published, which is what the packed tarball carries.
  binOf = member:
    let
      manifest = manifestOf member;
      published = manifest.publishConfig or { };
      bin = published.bin or manifest.bin or { };
    in
    if builtins.isAttrs bin then bin.${member.attr} or (throw "nix/generators.nix: ${member.name} publishes no '${member.attr}' bin") else bin;

  # Every workspace member the package needs at run time, following both kinds of
  # dependency so the fixture can import what a member's own devDependencies hold.
  workspaceDepNames = member:
    let
      manifest = manifestOf member;
      deps = (manifest.dependencies or { }) // (manifest.devDependencies or { });
    in
    lib.attrNames (lib.filterAttrs (_: spec: lib.hasPrefix "workspace:" (toString spec)) deps);

  closureOf = member:
    let
      go = seen: name:
        if lib.elem name seen then [ ]
        else
          let
            dep = lib.findFirst (candidate: candidate.name == name) null members;
          in
          [ name ] ++ lib.optionals (dep != null) (lib.concatMap (go (seen ++ [ name ])) (workspaceDepNames dep));
    in
    lib.filter (candidate: lib.elem candidate.name (go [ ] member.name)) members;

  # This workspace's own resolution inputs: pnpm needs them to install offline.
  seed = pkgs.runCommand "u13-workspace-seed" { } ''
    mkdir -p "$out"
    install -Dm644 ${src + "/package.json"} "$out/package.json"
    install -Dm644 ${src + "/pnpm-workspace.yaml"} "$out/pnpm-workspace.yaml"
    install -Dm644 ${src + "/pnpm-lock.yaml"} "$out/pnpm-lock.yaml"
    cp -r ${src + "/patches"} "$out/patches"
    ${lib.concatMapStringsSep "\n"
      (member: ''install -Dm644 ${src + "/${member.dir}/package.json"} "$out/${member.dir}/package.json"'')
      members}
  '';

  extractMember = member: ''
    stage="$scratch/.stage-${member.attr}"
    mkdir -p "$stage"
    tar -xzf ${workspace.${member.attr}} -C "$stage" --strip-components=1
    rm -f "$stage/package.json"
    cp -r "$stage/." "$scratch/${member.dir}"
  '';

  mkRunner = member: pkgs.writeShellScript "u13-${member.attr}-run" ''
    set -euo pipefail
    export PATH="${lib.makeBinPath [ nodejs pnpm pkgs.coreutils pkgs.gnutar ]}:$PATH"

    target="$(pwd -P)"
    scratch="$(mktemp -d "''${TMPDIR:-/tmp}/u13-${member.attr}.XXXXXX")"

    # The workspace lockfile and manifests, then each member's files from #606's
    # tarball for that member. The manifests stay the workspace's: they are what
    # the lockfile resolved, and the files that run are the tarballs'.
    cp -r ${seed}/. "$scratch/"
    chmod -R u+w "$scratch"
    ${lib.concatMapStringsSep "\n" extractMember (closureOf member)}
    rm -rf "$scratch"/.stage-*

    pnpm install --dir "$scratch" --offline --frozen-lockfile --filter "${member.name}..." --ignore-scripts --reporter=append-only

    # A module in the target imports the package's dependencies, so the target's
    # own resolution root is the app's node_modules — bound only where the
    # target has none of its own, and removed before the app returns. A target
    # that cannot take the link (a read-only checkout) keeps its own resolution.
    linked=""
    if [ ! -e "$target/node_modules" ] && ln -s "$scratch/${member.dir}/node_modules" "$target/node_modules" 2>/dev/null; then
      linked=1
    fi
    cleanup() {
      [ -z "$linked" ] || rm -f "$target/node_modules"
    }
    trap cleanup EXIT

    status=0
    node "$scratch/${member.dir}/${binOf member}" "$@" || status=$?
    cleanup
    trap - EXIT
    exit "$status"
  '';

  mkApp = member: pkgs.writeShellApplication {
    name = member.attr;
    runtimeInputs = [ sandbox nodejs pnpm pkgs.coreutils ];
    text = ''
      dir="."
      arguments=()
      dirValueNext=false
      for argument in "$@"; do
        if [ "$dirValueNext" = true ]; then
          dir="$argument"
          arguments+=(".")
          dirValueNext=false
          continue
        fi
        case "$argument" in
          --dir)
            dirValueNext=true
            arguments+=("$argument")
            ;;
          --dir=*)
            dir="''${argument#--dir=}"
            arguments+=("--dir=.")
            ;;
          *)
            arguments+=("$argument")
            ;;
        esac
      done
      cd "$dir"
      exec sandbox --pnpm-store ${workspace.pnpm-store} -- ${mkRunner member} "''${arguments[@]}"
    '';
    meta.description = "Run the ${member.attr} CLI from #606's tarball inside prm's sandbox";
  };

  debtLedger = mkApp (memberOf "debt-ledger");
  transitionDiagram = mkApp (memberOf "transition-diagram");

  mkCheck =
    { name, app, script }:
    pkgs.runCommand "u13-${name}-app-check" { nativeBuildInputs = [ pkgs.bash pkgs.coreutils ]; } ''
      # A host home with an ssh canary proves the app run cannot reach it.
      export HOME="$PWD/home"
      mkdir -p "$HOME/.ssh"
      echo "u13-app-canary" > "$HOME/.ssh/u13-canary"
      test -r "$HOME/.ssh/u13-canary"

      run_case() {
        local label="$1"
        local expected="$2"
        local needle="$3"
        shift 3
        local status=0
        local captured=""
        captured="$("$@" 2>&1)" || status=$?
        if [ "$status" -ne "$expected" ]; then
          echo "FAIL $label: exit $status, wanted $expected" >&2
          printf '%s\n' "$captured" >&2
          exit 1
        fi
        case "$captured" in
          *"$needle"*) ;;
          *)
            echo "FAIL $label: output lacks '$needle'" >&2
            printf '%s\n' "$captured" >&2
            exit 1
            ;;
        esac
        echo "ok $label (exit $status)"
      }

      ${script}

      mkdir -p "$out"
      echo "checks passed" > "$out/checked"
    '';
in
{
  apps = {
    debt-ledger = {
      type = "app";
      program = "${debtLedger}/bin/debt-ledger";
    };
    transition-diagram = {
      type = "app";
      program = "${transitionDiagram}/bin/transition-diagram";
    };
  };

  checks = {
    debt-ledger-app = mkCheck {
      name = "debt-ledger";
      app = debtLedger;
      script = ''
        cp -r ${./fixtures/debt-ledger-clean} "$PWD/clean"
        cp -r ${./fixtures/debt-ledger-suppressed} "$PWD/suppressed"
        chmod -R u+w "$PWD/clean" "$PWD/suppressed"
        run_case "a clean fixture exits 0" 0 "debt-ledger: scanned" \
          ${debtLedger}/bin/debt-ledger check --dir "$PWD/clean"
        run_case "an undeclared suppression exits 1 naming it" 1 "undeclared entries:" \
          ${debtLedger}/bin/debt-ledger check --dir "$PWD/suppressed"

        # The same app run, pointed at the host's ssh directory: absent inside
        # the sandbox, so the scan refuses it.
        mkdir -p "$PWD/canary/src"
        echo "export const greeting = 'hi'" > "$PWD/canary/src/index.ts"
        printf 'export default { roots: [%s], exclude: [] }\n' "'$HOME/.ssh'" > "$PWD/canary/debt-ledger.config.ts"
        run_case "the host ~/.ssh is unreadable inside the app run" 1 "$HOME/.ssh" \
          ${debtLedger}/bin/debt-ledger check --dir "$PWD/canary"
      '';
    };

    transition-diagram-app = mkCheck {
      name = "transition-diagram";
      app = transitionDiagram;
      script = ''
        cp -r ${./fixtures/transition-diagram} "$PWD/diagram"
        chmod -R u+w "$PWD/diagram"
        run_case "the fixture builds its diagrams" 0 "wrote" \
          ${transitionDiagram}/bin/transition-diagram build --dir "$PWD/diagram"
        run_case "check passes after the build" 0 "ok:" \
          ${transitionDiagram}/bin/transition-diagram check --dir "$PWD/diagram"
      '';
    };
  };
}
